/**
 * SignaturePad — Canvas-based signature drawing component.
 *
 * Supports:
 *   • Freehand drawing with mouse or touch
 *   • "Clear" and "Done" actions
 *   • Upload image as alternative
 *   • Returns base64 dataURL via onSave callback
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, Check, Upload, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SignaturePadProps {
  /** Called with base64 PNG data URL when user clicks Done */
  onSave: (dataUrl: string) => void
  /** Called when user clicks Cancel */
  onCancel: () => void
  /** Existing signature to pre-populate */
  initialSignature?: string | null
  /** Custom CSS class for the outer container */
  className?: string
}

export function SignaturePad({ onSave, onCancel, initialSignature, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')

  // ── Setup canvas ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // High-DPI scaling
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Default styles
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Load initial signature if provided
    if (initialSignature) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
        setHasDrawn(true)
      }
      img.src = initialSignature
    }
  }, [initialSignature])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }, [])

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }, [getPos])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }, [isDrawing, getPos])

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
  }, [])

  const handleDone = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }, [onSave])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const rect = canvas.getBoundingClientRect()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, rect.width, rect.height)

        // Fit image within canvas
        const scale = Math.min(rect.width / img.width, rect.height / img.height) * 0.8
        const w = img.width * scale
        const h = img.height * scale
        const x = (rect.width - w) / 2
        const y = (rect.height - h) / 2
        ctx.drawImage(img, x, y, w, h)
        setHasDrawn(true)
        setMode('draw')
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [])

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'draw' ? 'default' : 'outline'}
          size="sm"
          className={mode === 'draw' ? 'btn-gradient' : ''}
          onClick={() => setMode('draw')}
        >
          <PenLine className="h-4 w-4 mr-1" />
          Draw
        </Button>
        <Button
          type="button"
          variant={mode === 'upload' ? 'default' : 'outline'}
          size="sm"
          className={mode === 'upload' ? 'btn-gradient' : ''}
          onClick={() => setMode('upload')}
        >
          <Upload className="h-4 w-4 mr-1" />
          Upload
        </Button>
      </div>

      {mode === 'upload' ? (
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
            id="signature-upload"
          />
          <label
            htmlFor="signature-upload"
            className="cursor-pointer flex flex-col items-center gap-2 text-slate-500 hover:text-cyan-600 transition-colors"
          >
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">Click to upload signature image</span>
            <span className="text-xs text-slate-400">PNG, JPG (max 2MB)</span>
          </label>
        </div>
      ) : (
        <>
          {/* Canvas */}
          <div className="relative border-2 border-slate-200 rounded-xl overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair touch-none"
              style={{ height: 160 }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-300 text-sm select-none">Sign here</span>
              </div>
            )}
          </div>

          {/* Clear */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearCanvas}
            className="self-start text-slate-500 hover:text-red-500"
          >
            <Eraser className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleDone}
          disabled={!hasDrawn}
          className="btn-gradient"
        >
          <Check className="h-4 w-4 mr-1" />
          Confirm Signature
        </Button>
      </div>
    </div>
  )
}
