# FJG Universal Dashboard

Reusable, live folder dashboards inside Obsidian. Choose **Resource Hub**, **Program / Area**, **Notion (tabbed)**, or **Budget (PDF reports)**, browse in Portal, Cards, List, Compact, or Table view, and preview or edit the original notes.

## Start

Requires Obsidian 1.10+ with the **Bases** core plugin enabled. Install the three release assets (`main.js`, `manifest.json`, `styles.css`) into `.obsidian/plugins/universal-use-dashboard/`, or add this repository through BRAT. Enable **FJG Universal Dashboard** in Community plugins.

1. Right-click a folder → **Enable Dashboard for Folder**.
2. Choose the template and select **Save dashboard**.
3. Open it from **Open as Dashboard**, the command palette, the dashboard ribbon icon, or the FJG File Focus dashboard toolbar button (File Focus 0.3.4+).
4. Shift-click an enabled folder in the native file explorer or File Focus to open its dashboard. Ordinary folder clicks retain their normal behavior.

Folders are explicitly enabled. Child folders inherit their nearest configured ancestor’s design when inheritance is enabled; a disabled ancestor blocks inheritance. Saving child settings creates a local override. Inherited children use their own folder names rather than copying the parent’s title, description, pins, or featured selections.

## Portal view

Choose **Portal** in the view switcher for a website-style resource library inspired by the Policies and Procedures dashboard. It provides a purple masthead, Overview / Find a resource / Work areas navigation, a serif search hero, collection statistics, work-area cards, useful starting points, and recent updates. Work areas group live resources by their first subfolder; direct files appear under General resources. Empty child folders remain discoverable.

The finder searches resource titles, summaries, paths, properties, full note bodies, selectable PDF text, and locally embedded notes/PDFs. Matching text excerpts appear in results. Type and status filters, pagination, original-note previews, resource menus, voice, and new-note creation use the same existing dashboard data and actions. Live refresh preserves the search field’s focus and entered text. Folder defaults can be set to **Portal (website style)** in Dashboard settings; **Classic views** returns to the original controls. Portal is a native live presentation, with no generated HTML snapshot, network service, or duplicated notes.

The Portal overview uses a fixed website page composition. Existing section visibility settings apply to its work areas, featured/pinned starting points, and recent resources; the Classic views retain custom section ordering.

## Working with resources

- Search titles, summaries, paths, properties, and document contents; combine exact Type, Status, Program, and Tag filters.
- **Include subfolders** changes the underlying Bases folder query and persists for the folder. Search and layout switches are temporary; choose defaults in Settings.
- Metadata reads existing `title`, `summary` / `description`, `icon`, `type`, `status`, `program`, `tags`, `banner` / `image`, `featured`, and `pinned` properties. Missing fields fall back to filename and extension. Existing inline tags are also available as filters. This plugin never creates tags automatically.
- Banner images resolve local vault attachments, including wiki-link paths. Remote images are not automatically fetched.
- Resource menus pin or feature an item in folder settings without rewriting its note. A note with `pinned: true` or `featured: true` keeps that state until you explicitly edit its property.
- Program / Area adds live status counts and an overview. Sections can be hidden or reordered with accessible up/down buttons.
- Lists paginate at 24, 48, or 96 resources. Featured/pinned sections show up to one page, Recent shows six, and **All resources** makes every query result reachable.
- Markdown preview uses Obsidian’s renderer. **Edit** opens a Markdown text editor with explicit Save; concurrent file changes are rejected and leave your draft available to copy. Closing a dirty draft asks whether to keep editing or discard. **Open in tab** opens the full native Obsidian editor.
- Images, PDFs, audio/video, and supported text files have previews. Other formats offer their native viewer. Text previews over 2 MiB open in a tab instead.
- **New note** creates a note in the current folder and opens its editor; an existing filename is never overwritten.
- **Open folder**, Refresh, Copy dashboard link, and Create launcher note are available in the footer. A launcher embeds the live Base rather than generating static content.

## Voice

**Talk to dashboard** delegates to the installed FJG File Focus live voice feature (0.3.3+), passing the folder and optional selected note as context. It uses that plugin’s existing API-key resolution; this plugin stores no API key and makes no direct AI request. Press **Start conversation** in the existing voice window to connect. Its tools, model settings, microphone permissions, and note-edit behavior remain those of File Focus. Folder context is supplied to the conversation; it is not a hard access boundary for the existing vault assistant.

## Storage and portability

Each explicitly configured folder contains `_dashboard.json` (schema 1). Each opened dashboard has a small `_dashboard.base` query file. These are normal, syncable vault files, excluded from dashboard resource results. The Base registers the custom `fjg-universal-dashboard` view through the [public Obsidian Bases API](https://docs.obsidian.md/plugins/guides/bases-view). Bases supplies live file membership; the dashboard adds presentation, folder navigation, facets, and actions.

`_dashboard.base` is plugin-managed: its first `filters.and` expression is the folder scope. Additional filters, formulas, and extra views are preserved when that scope changes. Do not replace the first scope expression manually; use dashboard settings. Unrelated files occupying the reserved Base filename are refused. Malformed or unsupported configuration shows an error instead of silently replacing it.

Pins and featured selections are relative to their folder. Note and folder renames inside Obsidian repair applicable selections and managed Base paths. Cross-device access needs the synced vault, the installed plugin, and Bases. No local server, absolute machine path, build dependencies, or Codex connection is needed. Voice additionally requires File Focus and its credential setup on that device.

Global appearance and page size use Obsidian’s plugin settings. Both FJG and native accents respect Obsidian theme variables. Narrow panes use a single resource column and wrapping controls; settings and editing remain available on mobile. Physical iPhone/iPad and cross-device Sync behavior still need device acceptance.

## Development

```sh
npm ci
npm run check
npm run install:vault -- "/path/to/vault"
```

Source and development dependencies stay outside the vault. `scripts/install.mjs` accepts the vault argument or `FJG_VAULT` and copies only runtime files. Live acceptance scripts require the macOS Obsidian CLI and an explicitly prepared sample folder; they are development utilities, not runtime dependencies.

Companion plugins can register future actions without changing saved folder configuration:

```ts
const dashboard = app.plugins.getPlugin('universal-use-dashboard');
const unregister = dashboard.registerDashboardAction('my-action', {
  label: 'My action', icon: 'sparkles',
  run: ({ folder }) => openMyWorkflow(folder),
});
// Call unregister() when the companion unloads.
```

The public `openDashboard(folderOrPath)` method is used by File Focus. A custom URI is available: `obsidian://fjg-dashboard?vault=VAULT&folder=FOLDER` (URL-encode both values). Root is `/`.

## Release

Run checks, install and exercise the build in Obsidian, update manifest/package/versions metadata, commit and tag, then attach `main.js`, `manifest.json`, and `styles.css` to the GitHub release. No notes, credentials, dependency folders, or QA captures belong in a release.

## Notion-style tabs (0.3.0)

Select **Notion (tabbed)** in folder Dashboard Settings. This template has a compact document header and Content, Tasks, Meetings, Attachments, HTML, Pinned, and Folders tabs, with simple tables and status badges. Tasks includes items inside any folder whose name contains “Task” (case-insensitive), including descendants. Meetings includes only items inside a folder named “Meeting Notes” (case-insensitive). Matching is scoped to the current dashboard; task or meeting words in note titles/properties do not determine membership. Attachments includes non-note attachment files (PDFs, images, Office documents, media, etc.) and notes with resolved local links or embeds to those files. HTML includes .html and .htm documents; HTML and Base files are excluded from the attachment-file category. Tabs retain the dashboard’s subfolder scope and filters; enable Include subfolders to include nested folders. Content includes all scoped resources. Tabs support arrow keys, Home, and End. The template takes priority over the Classic default-view setting. Child folders inherit the template normally.

A working example is installed at `Artifacts/Universal Use Dashboard/Notion Sample/_dashboard.base`.

## Document-content search (0.3.0)

All layouts search Markdown and supported text files, selectable PDF text, and local Obsidian embeds (including nested notes and PDFs). Queries match all entered words, case-insensitively. Folder membership and facets still constrain the returned resources. Embedded text is attributed to its containing resource; snippets identify the match. Scanned PDFs require OCR; DOCX/XLSX bodies and remote documents are not indexed. Embedded heading references currently search the entire target document. Nesting is bounded to eight levels, with cycle protection and explicit warnings when incomplete.

The index is in memory and revision-keyed, with four workers per dashboard update. It does not send data to a service or create a second copy in the vault. Opening a large collection may initially show “Reading document contents…”. File modifications refresh search. Refresh also clears cached extraction results. Unsupported file types remain searchable by metadata.

## PDF budget template (0.3.0)

Select **Budget (PDF reports)** for a folder of **Remaining by Line Item** reports matching the supplied September format. Obsidian's bundled PDF.js extracts the original PDFs directly on each device. No Python, local server, sidecar export, API key, or outside filesystem dependency is required at runtime.

Overview displays each report's collective rollup. Program tabs display the rollup and all fund tables, original/adjusted budgets, encumbrances, actuals, and remaining balances. Negative remaining values are red. Source dates, source-page numbers, spend-down notes, and source PDF opening remain visible. Search filters line items, while fund totals stay labeled as totals for all rows. Different reports are never silently combined into one total.

The parser retains integer cents, reconciles rows with fund totals and funds with rollups, and warns on incomplete/unsupported formats or discrepancies. It preserves reported remaining amounts rather than replacing them with inferred calculations. This new template includes every source account line, matching the requested screenshot; it does not alter the separate existing Budget Dashboard's account restrictions. PDFs with other layouts need an additional parser or must be opened in their native viewer.

The September folder is configured at `03 Areas/Fiscal/September 2026/_dashboard.base`. Its title refers to the folder month; the displayed report metadata preserves fiscal year 2025–26 and source export dates from the PDFs.
