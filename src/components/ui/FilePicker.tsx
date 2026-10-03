import { useEffect, useRef, useState } from "react";

type Props = {
  onPick: (file?: File) => void;
  /** What the photo is for, e.g. "India driving licence", so the drop target names it. */
  forWhat?: string;
};

export default function FilePicker({ onPick, forWhat }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  }, [thumbUrl]);

  const pick = (file?: File) => {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    if (file) {
      setFileName(file.name);
      setThumbUrl(URL.createObjectURL(file));
    } else {
      setFileName(null);
      setThumbUrl(null);
    }
    onPick(file);
  };

  return (
    <div
      className={`dropzone ${dragging ? "drag" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) pick(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="thumb" />
      ) : (
        <div className="thumbPlaceholder">+</div>
      )}

      <div className="copy">
        <div className="primaryText">
          {fileName ?? `Choose a photo${forWhat ? ` for your ${forWhat}` : ""}, or drag one here`}
        </div>
        <div className="secondaryText">
          {fileName ? "Click to choose a different photo" : "Well-lit, facing the camera, plain background works best"}
        </div>
      </div>
    </div>
  );
}
