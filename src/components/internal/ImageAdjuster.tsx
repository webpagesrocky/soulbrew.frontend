import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/errors";
import { cropToDataUrl, IMAGE_ASPECT, loadImage } from "../../api/image";

interface Props {
  /** Archivo recién elegido, o el data URI de una foto ya guardada. */
  source: File | string;
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

const MAX_ZOOM = 3;

/**
 * Encuadre de la foto: arrastrar para mover, deslizador para acercar.
 *
 * El recuadro tiene la misma proporción que la tarjeta del menú, así que lo
 * que se ve aquí es literalmente lo que se guarda — el recorte se aplica al
 * confirmar y la imagen queda ya encuadrada.
 */
export function ImageAdjuster({ source, onApply, onCancel, onError }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    loadImage(source)
      .then((image) => {
        if (cancelled) return;
        if (typeof source !== "string") objectUrl = image.src;
        imageRef.current = image;
        setNatural({ width: image.naturalWidth, height: image.naturalHeight });
        setReady(true);
      })
      .catch((reason) => onError(errorMessage(reason, "No se pudo leer la imagen")));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, onError]);

  // El recuadro es fluido, así que su tamaño real sólo se conoce al montar.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () =>
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  // Escala mínima para que la imagen siempre cubra el recuadro: nunca se ven
  // franjas vacías, igual que hacía object-fit: cover.
  const baseScale =
    natural.width && viewport.width
      ? Math.max(viewport.width / natural.width, viewport.height / natural.height)
      : 1;
  const scale = baseScale * zoom;
  const displayed = { width: natural.width * scale, height: natural.height * scale };

  /** Impide arrastrar la imagen más allá de sus bordes. */
  function clamp(next: { x: number; y: number }) {
    const limitX = Math.max(0, (displayed.width - viewport.width) / 2);
    const limitY = Math.max(0, (displayed.height - viewport.height) / 2);
    return {
      x: Math.min(limitX, Math.max(-limitX, next.x)),
      y: Math.min(limitY, Math.max(-limitY, next.y)),
    };
  }

  useEffect(() => {
    setOffset((current) => clamp(current));
    // Al cambiar el zoom hay que reencajar el desplazamiento actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, viewport.width, viewport.height, natural.width, natural.height]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset(
      clamp({
        x: drag.ox + (event.clientX - drag.x),
        y: drag.oy + (event.clientY - drag.y),
      }),
    );
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function apply() {
    const image = imageRef.current;
    if (!image || !viewport.width) return;
    setBusy(true);
    try {
      // Esquina superior izquierda de la imagen dentro del recuadro.
      const left = (viewport.width - displayed.width) / 2 + offset.x;
      const top = (viewport.height - displayed.height) / 2 + offset.y;
      onApply(
        cropToDataUrl(image, {
          sx: -left / scale,
          sy: -top / scale,
          sw: viewport.width / scale,
          sh: viewport.height / scale,
        }),
      );
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo recortar la imagen"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adjuster-backdrop" onClick={onCancel}>
      <div className="adjuster-card" onClick={(event) => event.stopPropagation()}>
        <div className="editor-head">
          <h2>Ajustar foto</h2>
          <button type="button" onClick={onCancel} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <p className="adjuster-hint">Arrastra para mover · usa el deslizador para acercar</p>

        <div
          className="adjuster-viewport"
          ref={viewportRef}
          style={{ aspectRatio: String(IMAGE_ASPECT) }}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {ready && imageRef.current && (
            <img
              src={imageRef.current.src}
              alt="Ajuste de la foto"
              draggable={false}
              style={{
                width: displayed.width,
                height: displayed.height,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          {!ready && <span className="adjuster-loading">Cargando…</span>}
        </div>

        <label className="adjuster-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>

        <div className="editor-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="reference-primary" onClick={apply} disabled={!ready || busy}>
            {busy ? "Recortando…" : "Usar esta foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
