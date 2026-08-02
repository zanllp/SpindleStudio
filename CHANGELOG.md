# Changelog

All notable changes to SpindleStudio are documented here. The format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] - 2026-08-02

### Added

- **Prompt snippet library**: save any message's prompt as a reusable snippet from the message actions, browse and insert snippets from the input box, manage them in Settings
- **Generation queue panel**: per-image tracking of every generation task across all conversations — live generating / done / error status, click a card to jump to its source message, clear finished tasks; newest tasks appear at the bottom and the list auto-scrolls to keep them visible
- **On-the-fly image thumbnails**: the server now serves small cached thumbnails for the chat list, queue panel and upload history instead of full-size generations, dramatically cutting memory use in long conversations

### Changed

- **Long conversations stay smooth**: off-screen images release their decoded memory and restore seamlessly when scrolled back into view; fast scrolling no longer shows blank flashes for text messages
- **Generation completion no longer jumps**: finishing (or failing) a generation no longer scrolls the message list to the bottom — the queue toggle button pulses to notify you instead
- **Lighter message rows**: message action tooltips and the delete confirmation are now lightweight hand-written components, so long conversations mount and re-render noticeably faster; deleting a message without generated images is an inline two-step confirm
- **Sidebar capped at the 20 most recent conversations**, with a hint at the bottom of the list when more exist
- **Vista glass surfaces**: the queue toggle, scroll-to-bottom button, generation queue cards and the input box now use the Aero glass recipe (gradient, inner highlight, glow) instead of plain white
- **New Frutiger Aero wallpaper**: regenerated dewy-grass-and-soap-bubbles background

### Fixed

- Messages with generated images no longer require two stacked confirmations (popconfirm + modal) to delete
- Vista theme: the generation queue panel mixed light content-area colors onto the dark sidebar background (dark-on-dark text, bright white card borders)
- Vista theme: error and warning boxes no longer render as flat light alert cards on the dark background
