# Media Bank — *planned*

Not yet built. This documents the intended first-class model so it slots into the
same primitive graph when implemented (Parts XXII–XXIV).

## Model

- `MediaAsset` — `id, filename, type, storageRef, thumbnail, tags[], businessId?,
  projectId?, campaignId?, customerRef?, product?, createdAt, updatedAt`.
- `MediaCollection` — business / project / campaign / customer / product /
  personal / marketing. An asset may belong to **many** collections via
  relationships — **never duplicate files**.

## Connections

Media is one arm of a connected Project:

```
PROJECT ── tasks ── calendar ── goals ── progress ── MEDIA
```

## Guardrails

- Foundation, not a Dropbox replacement.
- Storage via Supabase Storage (or equivalent) behind a typed adapter, like every
  other JoshOS data surface — desktop-gated for personal assets.
- Performance: paginate/lazy-load; never load the whole bank at once.
