import { FileImage } from 'lucide-react'
import React from 'react'
import type { RgbaImage } from '../../lib/gainMap'
import { PreviewCanvas } from './PreviewCanvas'

type PreviewTileProps = {
  title: string
  image?: RgbaImage
}

export const PreviewTile = React.memo(function PreviewTile({ title, image }: PreviewTileProps) {
  return (
    <article className="preview-tile">
      <header>
        <FileImage aria-hidden="true" />
        <h2>{title}</h2>
      </header>
      {image ? <PreviewCanvas image={image} title={title} /> : <div className="empty-preview" />}
    </article>
  )
})
