export const notes = (
  <div>
    <p>The file you presented from is the whole deck, and it carries its own source.</p>
  </div>
);

export default function EjectSlide() {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        One file
      </div>
      <h2 className="font-heading text-[72px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
        This deck is one HTML file
      </h2>
      <p className="mt-8 max-w-3xl font-body text-2xl text-muted">
        It presents offline. Run it live and the room joins. Eject it and it is a project again, plugin included.
      </p>
      <pre className="mt-10 font-mono text-xl text-accent">liebstoeckel eject the-room.html</pre>
    </div>
  );
}
