import { useState } from "react";
import { approximateKb } from "../../api/image";
import { ImageAdjuster } from "./ImageAdjuster";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  onError: (message: string) => void;
  /** Permite pegar una URL externa además de subir un archivo. */
  allowUrl?: boolean;
}

/**
 * Campo de foto del producto: subir, encuadrar, reencuadrar y quitar.
 *
 * Toda imagen subida pasa por el ajustador antes de guardarse, así que nunca
 * queda un recorte automático que corte lo importante.
 */
export function ImageField({ value, onChange, onError, allowUrl = false }: Props) {
  const [pending, setPending] = useState<File | null>(null);
  const [reframing, setReframing] = useState(false);

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setPending(file);
  }

  // Sólo se puede reencuadrar lo que guardamos nosotros: una URL externa no se
  // puede leer en un canvas sin permisos CORS del otro servidor.
  const canReframe = Boolean(value?.startsWith("data:"));

  return (
    <>
      <div className="image-picker">
        {value ? (
          <div className="image-preview">
            <img src={value} alt="Vista previa" />
            <div>
              <small>{value.startsWith("data:") ? `${approximateKb(value)} KB` : "URL externa"}</small>
              <div className="image-preview-actions">
                {canReframe && (
                  <button type="button" onClick={() => setReframing(true)}>
                    Reencuadrar
                  </button>
                )}
                <button type="button" onClick={() => onChange(null)}>
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <label className="image-drop">
              <input type="file" accept="image/*" onChange={pick} />
              <span>Subir foto</span>
            </label>
            {allowUrl && (
              <input name="imageUrl" placeholder="…o pega una URL de imagen" type="url" />
            )}
          </>
        )}
      </div>

      {(pending || reframing) && (
        <ImageAdjuster
          source={pending ?? value!}
          onApply={(dataUrl) => {
            onChange(dataUrl);
            setPending(null);
            setReframing(false);
          }}
          onCancel={() => {
            setPending(null);
            setReframing(false);
          }}
          onError={(message) => {
            onError(message);
            setPending(null);
            setReframing(false);
          }}
        />
      )}
    </>
  );
}
