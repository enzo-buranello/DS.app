// Bouton conservé à sa place ; l'export sera reconstruit sur le pont local Figma.
export default function FigmaExportButton() {
  return (
    <button
      className="export-button"
      disabled
      title="Export Figma : bientôt disponible via le pont local"
    >
      <span aria-hidden="true">↗</span> Exporter
    </button>
  );
}
