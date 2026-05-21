export default function MessagesPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="atelier-empty-state atelier-empty-state-centered max-w-sm">
        <span className="atelier-empty-glyph" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Select a conversation or start a new one.
        </p>
      </div>
    </div>
  );
}
