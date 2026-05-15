#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>
#include <semaphore.h>
#include <libheif/heif.h>
#include <libheif/heif_aux_images.h>
#include <libheif/heif_context.h>
#include <libheif/heif_encoding.h>
#include <libheif/heif_image.h>
#include <libheif/heif_image_handle.h>
#include <libheif/heif_items.h>
#include <libheif/heif_metadata.h>
#include <libheif/heif_properties.h>

#ifdef __EMSCRIPTEN__
extern "C" int sem_close(sem_t*) {
  return 0;
}

extern "C" int sem_unlink(const char*) {
  return 0;
}
#endif

namespace {

constexpr const char* kAppleHdrGainMapUrn = "urn:com:apple:photo:2020:aux:hdrgainmap";

#ifndef APPLE_HDR_HEIC_TRACE
#define APPLE_HDR_HEIC_TRACE 0
#endif

struct WriteBuffer {
  std::vector<uint8_t> bytes;
};

heif_error write_to_vector(heif_context*, const void* data, size_t size, void* userdata) {
  auto* out = static_cast<WriteBuffer*>(userdata);
  const auto* first = static_cast<const uint8_t*>(data);
  out->bytes.insert(out->bytes.end(), first, first + size);
  return heif_error_success;
}

bool failed(const heif_error& error) {
  return error.code != heif_error_Ok;
}

void trace_step(const char* step) {
#if APPLE_HDR_HEIC_TRACE
  std::fprintf(stderr, "[apple-hdr-heic] %s\n", step);
  std::fflush(stderr);
#else
  (void)step;
#endif
}

std::string build_xmp(float headroom) {
  const float stops = std::log2(std::max(headroom, 1.05f));
  char stops_buf[32];
  std::snprintf(stops_buf, sizeof(stops_buf), "%.6f", stops);
  std::string xmp;
  xmp += "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"LumaHEIC\">";
  xmp += "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">";
  xmp += "<rdf:Description rdf:about=\"\" xmlns:HDRGainMap=\"http://ns.apple.com/HDRGainMap/1.0/\">";
  xmp += "<HDRGainMap:HDRGainMapVersion>131072</HDRGainMap:HDRGainMapVersion>";
  xmp += "<HDRGainMap:HDRGainMapHeadroom>";
  xmp += stops_buf;
  xmp += "</HDRGainMap:HDRGainMapHeadroom>";
  xmp += "</rdf:Description></rdf:RDF></x:xmpmeta>";
  return xmp;
}

void append_u16_be(std::vector<uint8_t>& bytes, uint16_t value) {
  bytes.push_back(static_cast<uint8_t>((value >> 8) & 0xff));
  bytes.push_back(static_cast<uint8_t>(value & 0xff));
}

void append_u32_be(std::vector<uint8_t>& bytes, uint32_t value) {
  bytes.push_back(static_cast<uint8_t>((value >> 24) & 0xff));
  bytes.push_back(static_cast<uint8_t>((value >> 16) & 0xff));
  bytes.push_back(static_cast<uint8_t>((value >> 8) & 0xff));
  bytes.push_back(static_cast<uint8_t>(value & 0xff));
}

void append_s32_be(std::vector<uint8_t>& bytes, int32_t value) {
  append_u32_be(bytes, static_cast<uint32_t>(value));
}

void append_ifd_entry_be(std::vector<uint8_t>& bytes, uint16_t tag, uint16_t type, uint32_t count, uint32_t value_or_offset) {
  append_u16_be(bytes, tag);
  append_u16_be(bytes, type);
  append_u32_be(bytes, count);
  append_u32_be(bytes, value_or_offset);
}

int32_t rational_numerator(float value, int32_t denominator) {
  const double scaled = static_cast<double>(value) * static_cast<double>(denominator);
  if (scaled > 2147483647.0) return 2147483647;
  if (scaled < -2147483648.0) return -2147483647 - 1;
  return static_cast<int32_t>(std::llround(scaled));
}

void append_signed_rational_be(std::vector<uint8_t>& bytes, float value) {
  constexpr int32_t kDenominator = 1000000;
  append_s32_be(bytes, rational_numerator(value, kDenominator));
  append_s32_be(bytes, kDenominator);
}

std::vector<uint8_t> build_apple_makernote(float headroom) {
  const float clamped_headroom = std::max(headroom, 1.05f);
  const float hdr_gain = std::log2(clamped_headroom);
  std::vector<uint8_t> maker;
  const uint8_t signature[] = {'A', 'p', 'p', 'l', 'e', ' ', 'i', 'O', 'S', 0, 0, 1, 'M', 'M'};
  maker.insert(maker.end(), signature, signature + sizeof(signature));
  append_u16_be(maker, 2);
  append_ifd_entry_be(maker, 0x0021, 10, 1, 44);
  append_ifd_entry_be(maker, 0x0030, 10, 1, 52);
  append_u32_be(maker, 0);
  append_signed_rational_be(maker, clamped_headroom);
  append_signed_rational_be(maker, hdr_gain);
  return maker;
}

std::vector<uint8_t> build_exif(float headroom) {
  constexpr uint32_t kTiffHeaderOffset = 0;
  constexpr uint32_t kIfd0Offset = 8;
  constexpr uint32_t kIfd0EntryCount = 3;
  constexpr uint32_t kIfd0DataOffset = kIfd0Offset + 2 + kIfd0EntryCount * 12 + 4;
  constexpr char kMake[] = "Apple";
  constexpr char kSoftware[] = "LumaHEIC";
  constexpr uint32_t kMakeLength = sizeof(kMake);
  constexpr uint32_t kSoftwareLength = sizeof(kSoftware);
  constexpr uint32_t kMakeOffset = kIfd0DataOffset;
  constexpr uint32_t kSoftwareOffset = kMakeOffset + kMakeLength;
  constexpr uint32_t kExifIfdOffset = kSoftwareOffset + kSoftwareLength;
  constexpr uint32_t kExifIfdEntryCount = 3;
  constexpr uint32_t kExifIfdDataOffset = kExifIfdOffset + 2 + kExifIfdEntryCount * 12 + 4;

  const std::vector<uint8_t> maker_note = build_apple_makernote(headroom);
  std::vector<uint8_t> exif;

  exif.push_back('M');
  exif.push_back('M');
  append_u16_be(exif, 42);
  append_u32_be(exif, kIfd0Offset);

  append_u16_be(exif, kIfd0EntryCount);
  append_ifd_entry_be(exif, 0x010f, 2, kMakeLength, kMakeOffset);
  append_ifd_entry_be(exif, 0x0131, 2, kSoftwareLength, kSoftwareOffset);
  append_ifd_entry_be(exif, 0x8769, 4, 1, kExifIfdOffset);
  append_u32_be(exif, 0);

  exif.insert(exif.end(), kMake, kMake + kMakeLength);
  exif.insert(exif.end(), kSoftware, kSoftware + kSoftwareLength);

  append_u16_be(exif, kExifIfdEntryCount);
  append_ifd_entry_be(exif, 0x9000, 7, 4, 0x30323331);
  append_ifd_entry_be(exif, 0x927c, 7, static_cast<uint32_t>(maker_note.size()), kExifIfdDataOffset);
  append_ifd_entry_be(exif, 0xa001, 3, 1, 0xffff0000);
  append_u32_be(exif, 0);
  exif.insert(exif.end(), maker_note.begin(), maker_note.end());

  (void)kTiffHeaderOffset;
  return exif;
}

heif_error fill_rgba_image(heif_image* image, const uint8_t* rgba, int width, int height) {
  int stride = 0;
  uint8_t* plane = heif_image_get_plane(image, heif_channel_interleaved, &stride);
  if (!plane) {
    return {heif_error_Usage_error, heif_suberror_Unspecified, "Could not get RGB plane"};
  }

  for (int y = 0; y < height; y++) {
    uint8_t* row = plane + y * stride;
    const uint8_t* src = rgba + y * width * 4;
    for (int x = 0; x < width; x++) {
      row[x * 3 + 0] = src[x * 4 + 0];
      row[x * 3 + 1] = src[x * 4 + 1];
      row[x * 3 + 2] = src[x * 4 + 2];
    }
  }

  return heif_error_success;
}

heif_error fill_mono_image(heif_image* image, const uint8_t* luma, int width, int height) {
  int stride = 0;
  uint8_t* plane = heif_image_get_plane(image, heif_channel_Y, &stride);
  if (!plane) {
    return {heif_error_Usage_error, heif_suberror_Unspecified, "Could not get luma plane"};
  }

  for (int y = 0; y < height; y++) {
    std::memcpy(plane + y * stride, luma + y * width, static_cast<size_t>(width));
  }

  return heif_error_success;
}

heif_error add_auxc_property(heif_context* ctx, heif_item_id gain_id) {
  std::vector<uint8_t> auxc;
  // FullBox header: version=0, flags=0.
  auxc.push_back(0);
  auxc.push_back(0);
  auxc.push_back(0);
  auxc.push_back(0);
  auxc.insert(auxc.end(), kAppleHdrGainMapUrn, kAppleHdrGainMapUrn + std::strlen(kAppleHdrGainMapUrn));
  auxc.push_back(0);

  return heif_item_add_raw_property(
    ctx,
    gain_id,
    heif_fourcc('a', 'u', 'x', 'C'),
    nullptr,
    auxc.data(),
    auxc.size(),
    1,
    nullptr);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
int encode_apple_hdr_heic(
  const uint8_t* base_rgba,
  int width,
  int height,
  const uint8_t* gain_luma,
  int gain_width,
  int gain_height,
  int quality,
  float headroom,
  uint8_t** out_bytes,
  uint32_t* out_len,
  int /* reserved */) {
  trace_step("enter encode_apple_hdr_heic");
  if (!base_rgba || !gain_luma || !out_bytes || !out_len || width <= 0 || height <= 0 || gain_width <= 0 || gain_height <= 0) {
    return 1;
  }

  trace_step("alloc context");
  heif_context* ctx = heif_context_alloc();
  heif_encoder* encoder = nullptr;
  heif_image* base_image = nullptr;
  heif_image* gain_image = nullptr;
  heif_image_handle* base_handle = nullptr;
  heif_image_handle* gain_handle = nullptr;

  auto cleanup = [&]() {
    if (base_handle) heif_image_handle_release(base_handle);
    if (gain_handle) heif_image_handle_release(gain_handle);
    if (base_image) heif_image_release(base_image);
    if (gain_image) heif_image_release(gain_image);
    if (encoder) heif_encoder_release(encoder);
    if (ctx) heif_context_free(ctx);
  };

  trace_step("get HEVC encoder");
  heif_error err = heif_context_get_encoder_for_format(ctx, heif_compression_HEVC, &encoder);
  if (failed(err)) { cleanup(); return 2; }
  trace_step("set encoder parameters");
  heif_encoder_set_lossy_quality(encoder, quality);
#if APPLE_HDR_HEIC_TRACE
  heif_encoder_set_logging_level(encoder, 4);
#else
  heif_encoder_set_logging_level(encoder, 0);
#endif
  err = heif_encoder_set_parameter_string(encoder, "preset", "ultrafast");
  if (failed(err)) { cleanup(); return 17; }
  err = heif_encoder_set_parameter_string(encoder, "tune", "fastdecode");
  if (failed(err)) { cleanup(); return 18; }
  err = heif_encoder_set_parameter_string(encoder, "x265:pools", "none");
  if (failed(err)) { cleanup(); return 19; }
  err = heif_encoder_set_parameter_string(encoder, "x265:frame-threads", "1");
  if (failed(err)) { cleanup(); return 20; }
  err = heif_encoder_set_parameter_string(encoder, "x265:wpp", "0");
  if (failed(err)) { cleanup(); return 21; }
  err = heif_encoder_set_parameter_string(encoder, "x265:pmode", "0");
  if (failed(err)) { cleanup(); return 22; }
  err = heif_encoder_set_parameter_string(encoder, "x265:pme", "0");
  if (failed(err)) { cleanup(); return 23; }
  err = heif_encoder_set_parameter_string(encoder, "x265:threaded-me", "0");
  if (failed(err)) { cleanup(); return 24; }
  err = heif_encoder_set_parameter_string(encoder, "x265:lookahead-slices", "0");
  if (failed(err)) { cleanup(); return 25; }
  err = heif_encoder_set_parameter_string(encoder, "x265:lookahead-threads", "0");
  if (failed(err)) { cleanup(); return 26; }
  err = heif_encoder_set_parameter_string(encoder, "x265:rc-lookahead", "0");
  if (failed(err)) { cleanup(); return 27; }
  err = heif_encoder_set_parameter_string(encoder, "x265:bframes", "0");
  if (failed(err)) { cleanup(); return 28; }
  err = heif_encoder_set_parameter_string(encoder, "x265:b-adapt", "0");
  if (failed(err)) { cleanup(); return 29; }

  trace_step("create base image");
  err = heif_image_create(width, height, heif_colorspace_RGB, heif_chroma_interleaved_RGB, &base_image);
  if (failed(err)) { cleanup(); return 3; }
  trace_step("add base image plane");
  err = heif_image_add_plane(base_image, heif_channel_interleaved, width, height, 8);
  if (failed(err)) { cleanup(); return 4; }
  trace_step("fill base image");
  err = fill_rgba_image(base_image, base_rgba, width, height);
  if (failed(err)) { cleanup(); return 5; }

  trace_step("encode base image");
  err = heif_context_encode_image(ctx, base_image, encoder, nullptr, &base_handle);
  if (failed(err)) { cleanup(); return 6; }
  trace_step("set primary image");
  err = heif_context_set_primary_image(ctx, base_handle);
  if (failed(err)) { cleanup(); return 7; }

  trace_step("create gain image");
  err = heif_image_create(gain_width, gain_height, heif_colorspace_monochrome, heif_chroma_monochrome, &gain_image);
  if (failed(err)) { cleanup(); return 8; }
  trace_step("add gain image plane");
  err = heif_image_add_plane(gain_image, heif_channel_Y, gain_width, gain_height, 8);
  if (failed(err)) { cleanup(); return 9; }
  trace_step("fill gain image");
  err = fill_mono_image(gain_image, gain_luma, gain_width, gain_height);
  if (failed(err)) { cleanup(); return 10; }

  trace_step("encode gain image");
  err = heif_context_encode_image(ctx, gain_image, encoder, nullptr, &gain_handle);
  if (failed(err)) { cleanup(); return 11; }

  trace_step("add aux property");
  heif_item_id base_id = heif_image_handle_get_item_id(base_handle);
  heif_item_id gain_id = heif_image_handle_get_item_id(gain_handle);
  err = add_auxc_property(ctx, gain_id);
  if (failed(err)) { cleanup(); return 12; }
  trace_step("add auxiliary reference");
  // HEIF/libheif and Apple-generated samples model `auxl` from the auxiliary
  // gain-map item to the primary image item.
  err = heif_context_add_item_reference(ctx, heif_fourcc('a', 'u', 'x', 'l'), gain_id, base_id);
  if (failed(err)) { cleanup(); return 13; }

  trace_step("add Apple MakerNote EXIF metadata");
  const std::vector<uint8_t> exif = build_exif(headroom);
  err = heif_context_add_exif_metadata(ctx, base_handle, exif.data(), static_cast<int>(exif.size()));
  if (failed(err)) { cleanup(); return 30; }

  trace_step("add XMP metadata");
  const std::string xmp = build_xmp(headroom);
  err = heif_context_add_XMP_metadata(ctx, base_handle, xmp.data(), static_cast<int>(xmp.size()));
  if (failed(err)) { cleanup(); return 14; }

  trace_step("write HEIC context");
  WriteBuffer output;
  heif_writer writer{};
  writer.writer_api_version = 1;
  writer.write = write_to_vector;
  err = heif_context_write(ctx, &writer, &output);
  if (failed(err)) { cleanup(); return 15; }
  trace_step("copy encoded output");

  *out_len = static_cast<uint32_t>(output.bytes.size());
  *out_bytes = static_cast<uint8_t*>(std::malloc(output.bytes.size()));
  if (!*out_bytes) { cleanup(); return 16; }
  std::memcpy(*out_bytes, output.bytes.data(), output.bytes.size());

  cleanup();
  trace_step("encode complete");
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void free_encoded_buffer(uint8_t* ptr) {
  std::free(ptr);
}

}
