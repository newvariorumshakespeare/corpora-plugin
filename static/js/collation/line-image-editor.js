// Edits the image regions of a collation line in a modal: recrop a region by dragging its box or its
// handles, add a region from any page of the witness (e.g. when a copy text line is broken across
// lines, or pages, in the witness), remove a region, or change their order.
//
// The viewer is a free view of the witness's pages. The selected region's box shows whenever its page
// is in view, and moving or resizing it updates the region as soon as the mouse is released. "Add an
// image" draws a new region on whatever is in view. Nothing is stored until Save.
//
// Regions are stored on a CollationLine as Corpora image URLs:
//     /image/uri/<page image uri, with / as |>/<x>,<y>,<width>,<height>/<size>/<rotation>/<quality.format>
// with the region in the full page image's pixels. Pages are shown with OpenSeadragon and boxes are
// drawn with its selection plugin, as Corpora's IIIF image field does.
//
// Shared by the Lineator and the Collator. Needs Bootstrap, Corpora's utilities.js, OpenSeadragon and
// openseadragonselection.js on the page.
//
//     const editor = new LineImageEditor({corpusId, playPrefix, csrfToken, onSave: (lineId, images) => ...})
//     editor.open({lineId, witnessId, images, title, text})
//
// text (optional) is the line's transcription, shown under the title as a reminder of what the regions
// should contain.

class LineImageEditor {
    constructor({corpusId, playPrefix, csrfToken, onSave}) {
        this.corpusId = corpusId
        this.playPrefix = playPrefix
        this.csrfToken = csrfToken
        this.onSave = onSave || (() => {})
        this.pagesByWitness = {}

        this.line = null        // {lineId, witnessId, title}
        this.images = []        // working copy of the line's regions (see parseImageUrl)
        this.pages = []         // the witness's page images, in page order
        this.pageIndex = null   // the page shown in the viewer
        this.active = null      // index of the selected region, 'new' while drawing one, or null
        this.pendingFrame = null
        this.dirty = false

        this.viewer = null
        this.selection = null

        this.buildModal()
    }

    // ------------------------------------------------------------------
    // REGION URLS
    // ------------------------------------------------------------------
    static parseImageUrl(url) {
        const match = url.match(/^\/image\/uri\/([^/]+)\/(\d+),(\d+),(\d+),(\d+)\/([^/]+)\/([^/]+)\/([^/]+)$/)
        if (!match) return {url: url, unparseable: true}
        const page = match[1].match(/\|page\|([^|]+)\|/)
        return {
            uri: match[1],
            refNo: page ? page[1] : null,
            region: {x: +match[2], y: +match[3], w: +match[4], h: +match[5]},
            size: match[6],
            rotation: match[7],
            quality: match[8],
        }
    }

    static buildImageUrl(image) {
        if (image.unparseable) return image.url
        const r = image.region
        return `/image/uri/${image.uri}/${r.x},${r.y},${r.w},${r.h}/${image.size}/${image.rotation}/${image.quality}`
    }

    static thumbnailUrl(image) {
        if (image.unparseable) return image.url
        const r = image.region
        return `/image/uri/${image.uri}/${r.x},${r.y},${r.w},${r.h}/!600,150/${image.rotation}/default.png`
    }

    // ------------------------------------------------------------------
    // MODAL
    // ------------------------------------------------------------------
    buildModal() {
        this.modal = htmlToEl(`
            <div class="modal fade" id="line-image-editor" tabindex="-1" aria-labelledby="line-image-editor-title" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <div class="lie-heading flex-grow-1">
                                <h5 class="modal-title" id="line-image-editor-title">Line images</h5>
                                <div class="lie-line-text mt-1"></div>
                            </div>
                            <button type="button" class="btn-close" data-lie="close" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row g-3">
                                <div class="col-md-4">
                                    <div class="lie-images"></div>
                                    <button type="button" class="btn btn-sm btn-outline-primary mt-2" data-lie="add">
                                        <i class="fas fa-plus"></i> Add an image
                                    </button>
                                </div>
                                <div class="col-md-8">
                                    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                                        <button type="button" class="btn btn-sm btn-light border" data-lie="previous-page" title="Previous page"><i class="fas fa-chevron-left"></i></button>
                                        <select class="form-select form-select-sm w-auto lie-page-select" aria-label="Page"></select>
                                        <button type="button" class="btn btn-sm btn-light border" data-lie="next-page" title="Next page"><i class="fas fa-chevron-right"></i></button>
                                        <span class="small text-muted lie-instructions"></span>
                                    </div>
                                    <div id="line-image-editor-viewer" class="lie-viewer"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <span class="small me-auto lie-message"></span>
                            <button type="button" class="btn btn-secondary" data-lie="close">Close</button>
                            <button type="button" class="btn btn-primary" data-lie="save" disabled>Save</button>
                        </div>
                    </div>
                </div>
            </div>`)
        document.body.appendChild(this.modal)
        this.modal.appendChild(htmlToEl(`
            <style>
                .lie-heading { min-width: 0; }
                .lie-line-text { font-size: 1.1rem; overflow-wrap: anywhere; }
                .lie-viewer { height: 65vh; background-color: #2b2b2b; border-radius: .25rem; }
                .lie-image { border: 1px solid var(--bs-border-color); border-radius: .25rem; padding: .4rem; margin-bottom: .5rem; }
                .lie-image.active { border-color: var(--bs-primary); box-shadow: 0 0 0 .15rem rgba(var(--bs-primary-rgb), .25); }
                .lie-image img { display: block; max-width: 100%; max-height: 4rem; margin-bottom: .3rem; cursor: pointer; }
                .lie-other-region { outline: 2px dashed rgba(255, 193, 7, .9); pointer-events: none; }

                /* show what dragging will do: draw a new box, pan the page, move the box, or resize it */
                .lie-viewer.lie-drawing .openseadragon-canvas { cursor: crosshair; }
                .lie-viewer.lie-panning .openseadragon-canvas { cursor: grab; }
                .lie-viewer.lie-panning .openseadragon-canvas:active { cursor: grabbing; }
                .lie-viewer .selection-box { cursor: move; }
                .lie-viewer .border-0, .lie-viewer .border-2,
                .lie-viewer .border-0-handle, .lie-viewer .border-2-handle { cursor: ns-resize; }
                .lie-viewer .border-1, .lie-viewer .border-3,
                .lie-viewer .border-1-handle, .lie-viewer .border-3-handle { cursor: ew-resize; }
                .lie-viewer .corner-0-handle, .lie-viewer .corner-2-handle { cursor: nwse-resize; }
                .lie-viewer .corner-1-handle, .lie-viewer .corner-3-handle { cursor: nesw-resize; }
            </style>`))

        this.listEl = this.modal.querySelector('.lie-images')
        this.pageSelect = this.modal.querySelector('.lie-page-select')
        this.instructionsEl = this.modal.querySelector('.lie-instructions')
        this.messageEl = this.modal.querySelector('.lie-message')
        this.saveButton = this.modal.querySelector('[data-lie="save"]')

        onDelegate(this.modal, 'click', '[data-lie]', (event, button) => {
            const action = button.dataset.lie
            const index = button.closest('.lie-image') ? parseInt(button.closest('.lie-image').dataset.index) : null
            if (action === 'close') this.close()
            else if (action === 'save') this.save()
            else if (action === 'add') this.startAdding()
            else if (action === 'previous-page') this.openPage(this.pageIndex - 1)
            else if (action === 'next-page') this.openPage(this.pageIndex + 1)
            else if (action === 'select') this.select(index)
            else if (action === 'delete') this.remove(index)
            else if (action === 'up') this.move(index, -1)
            else if (action === 'down') this.move(index, 1)
        })
        onEl(this.pageSelect, 'change', () => this.openPage(parseInt(getVal(this.pageSelect))))

        // OpenSeadragon needs its container to have a size, so it's created once the modal is showing;
        // the line's first image opens once the witness's pages have loaded
        onEl(this.modal, 'shown.bs.modal', () => {
            if (!this.viewer) this.createViewer()
            this.pagesReady.then(() => this.showInitialImage())
        })
        // don't let Escape or a click on the backdrop drop unsaved changes without asking
        onEl(this.modal, 'hide.bs.modal', event => {
            if (this.dirty && !this.closing && !confirm('Discard your changes to these images?')) event.preventDefault()
        })
    }

    createViewer() {
        this.viewer = OpenSeadragon({
            id: 'line-image-editor-viewer',
            prefixUrl: '/static/img/openseadragon/',
            visibilityRatio: .5,
            minZoomLevel: .2,
            maxZoomLevel: 10,
            showRotationControl: false,
            gestureSettingsMouse: {clickToZoom: false},
        })
        this.selection = this.viewer.selection({
            prefixUrl: '/static/img/openseadragonselection/',
            showSelectionControl: false,
            showConfirmDenyButtons: false,
            allowRotation: false,
            restrictToImage: true,
            returnPixelCoordinates: true,
            keyboardShortcut: null,
            // handles a little larger than the plugin's 6px, so they're easier to grab
            handleStyle: {width: '10px', height: '10px', margin: '-6px 0 0 -6px', background: '#000', border: '1px solid #ccc'},
            cornersStyle: {width: '10px', height: '10px', background: '#000', border: '1px solid #ccc'},
        })
        this.allowPanningWhileSelecting()

        // once a box has been drawn, moved, or resized, update the region as soon as the mouse is released
        // (listening in the capture phase, since OpenSeadragon's trackers can stop these events from
        // bubbling, and committing after the plugin has finished handling the release)
        const viewerEl = getEl('line-image-editor-viewer')
        let pressed = false
        viewerEl.addEventListener('pointerdown', () => pressed = true, true)
        document.addEventListener('pointerup', () => { if (pressed) { pressed = false; setTimeout(() => this.commitBox(), 0) } }, true)
        onEl(document, 'keydown', event => { if (event.key === 'Shift') this.updateDragMode(true) })
        onEl(document, 'keyup', event => { if (event.key === 'Shift') this.updateDragMode(false) })
        this.viewer.addHandler('open', () => this.pageOpened())
        this.viewer.addHandler('open-failed', () => this.showMessage("This page's image couldn't be loaded.", true))
    }

    // While the selection plugin is active it takes over dragging on the page: dragging outside the box
    // did nothing (it even switches OpenSeadragon's own panning off), so there was no way to pan to,
    // say, a right-aligned stage direction. Instead, dragging outside an existing box pans the page, and
    // so does holding Shift while dragging when there's no box yet (when a plain drag draws one).
    // Panning can take the page up to half a screen past its edges (visibilityRatio).
    allowPanningWhileSelecting() {
        const tracker = this.selection.outerTracker
        const drawDrag = tracker.dragHandler
        const drawDragEnd = tracker.dragEndHandler
        // decided when a drag starts and kept until it ends: deciding on every movement would turn a drag
        // that's drawing a box into a pan as soon as its first movement had created the box
        let mode = null

        tracker.dragHandler = event => {
            if (mode === null) mode = (this.selection.rect || event.shift) ? 'pan' : 'draw'
            if (mode === 'pan') {
                this.viewer.viewport.panBy(this.viewer.viewport.deltaPointsFromPixels(event.delta.negate()))
                // stop at the limit rather than springing back to it on release
                this.viewer.viewport.applyConstraints()
                return
            }
            drawDrag(event)
        }
        tracker.dragEndHandler = event => {
            const panned = mode === 'pan'
            mode = null
            if (panned) {
                this.viewer.viewport.applyConstraints()
                return
            }
            drawDragEnd(event)
            this.updateDragMode()
        }
    }

    // the page's cursor says whether dragging on it will draw a box or pan
    updateDragMode(shiftHeld = false) {
        const viewerEl = getEl('line-image-editor-viewer')
        const selecting = this.active !== null && this.selection && this.selection.isSelecting
        const pans = selecting && (this.selection.rect || shiftHeld)
        viewerEl.classList.toggle('lie-drawing', selecting && !pans)
        viewerEl.classList.toggle('lie-panning', selecting && !!pans)
    }

    open({lineId, witnessId, images, title, text}) {
        this.line = {lineId, witnessId, title}
        this.images = (images || []).map(url => LineImageEditor.parseImageUrl(url))
        this.active = this.images.length ? 0 : 'new'
        this.dirty = false
        this.closing = false
        this.modal.querySelector('.modal-title').textContent = title ? `Images for ${title}` : 'Line images'
        const textEl = this.modal.querySelector('.lie-line-text')
        textEl.textContent = text || ''
        textEl.classList.toggle('d-none', !text)
        this.showMessage('')
        this.renderList()

        // clear the last line's page and box, so nothing from another witness can be applied to this one
        this.pages = []
        this.pageIndex = null
        if (this.viewer) {
            this.selection.disable()
            this.viewer.clearOverlays()
            this.viewer.close()
        }
        this.instructionsEl.textContent = ''
        this.pageSelect.innerHTML = '<option>Loading pages…</option>'

        this.pagesReady = this.loadPages(witnessId)
        showModal(this.modal)
    }

    async loadPages(witnessId) {
        if (!this.pagesByWitness[witnessId]) {
            const response = await fetch(`/api/corpus/${this.corpusId}/lineator/${this.playPrefix}/pages/${witnessId}/`)
            this.pagesByWitness[witnessId] = response.ok ? (await response.json()).pages : []
        }
        this.pages = this.pagesByWitness[witnessId]
        this.pageSelect.innerHTML = this.pages.map((page, index) => `<option value="${index}">Page ${page.ref_no}</option>`).join('')
    }

    close() {
        if (this.dirty && !confirm('Discard your changes to these images?')) return
        this.closing = true
        hideModal(this.modal)
    }

    // open on the line's first region, or ready to draw one if it has none
    showInitialImage() {
        if (!this.pages.length) return this.showMessage("This witness has no page images to choose from.", true)
        if (this.active === 'new') this.startAdding()
        else this.select(this.active)
    }

    // ------------------------------------------------------------------
    // THE LINE'S REGIONS
    // ------------------------------------------------------------------
    renderList() {
        this.listEl.innerHTML = this.images.length
            ? this.images.map((image, index) => {
                const label = image.unparseable ? 'Unrecognized image URL' : `Page ${image.refNo} (${image.region.w} × ${image.region.h})`
                return `
                    <div class="lie-image ${index === this.active ? 'active' : ''}" data-index="${index}">
                        <img src="${LineImageEditor.thumbnailUrl(image)}" alt="" ${image.unparseable ? '' : 'data-lie="select" title="Show this region"'}>
                        <div class="d-flex align-items-center gap-1">
                            <span class="small text-muted me-auto">${index + 1}. ${label}</span>
                            ${image.unparseable ? '' : `<button type="button" class="btn btn-sm btn-light border" data-lie="select" title="Show and adjust this region"><i class="fas fa-crop-alt"></i></button>`}
                            <button type="button" class="btn btn-sm btn-light border" data-lie="up" title="Move up" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                            <button type="button" class="btn btn-sm btn-light border" data-lie="down" title="Move down" ${index === this.images.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                            <button type="button" class="btn btn-sm btn-outline-danger" data-lie="delete" title="Remove this region from the line"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`
            }).join('')
            : '<p class="small text-muted"><em>This line has no images.</em></p>'
        setDisabled(this.saveButton, !this.dirty)
    }

    // select a region to adjust: go to its page (zoomed in on it) unless it's already in view
    select(index) {
        const image = this.images[index]
        if (!image || image.unparseable) return
        this.active = index
        this.renderList()
        const pageIndex = this.pages.findIndex(page => page.image_uri === image.uri)
        if (pageIndex < 0) return this.showMessage(`Page ${image.refNo} isn't one of this witness's page images.`, true)

        if (pageIndex === this.pageIndex && this.viewer.world.getItemCount()) {
            this.showBoxes()
            this.zoomTo(image.region)
        } else {
            this.openPage(pageIndex, image.region)
        }
    }

    // draw a new region on whatever is in view (on opening a line with no images, that's the first page)
    startAdding() {
        this.active = 'new'
        this.renderList()
        if (this.pageIndex === null || !this.viewer.world.getItemCount()) this.openPage(this.pageIndex !== null ? this.pageIndex : 0)
        else this.showBoxes()
    }

    remove(index) {
        this.images.splice(index, 1)
        this.markDirty()
        if (this.active === index) this.active = null
        else if (typeof this.active === 'number' && this.active > index) this.active--
        this.renderList()
        this.showBoxes()
    }

    move(index, offset) {
        const target = index + offset
        if (target < 0 || target >= this.images.length) return
        ;[this.images[index], this.images[target]] = [this.images[target], this.images[index]]
        if (this.active === index) this.active = target
        else if (this.active === target) this.active = index
        this.markDirty()
        this.renderList()
    }

    markDirty() {
        this.dirty = true
        setDisabled(this.saveButton, false)
    }

    // ------------------------------------------------------------------
    // THE VIEWER
    // ------------------------------------------------------------------
    // open a page of the witness, optionally zoomed in on a region of it
    openPage(pageIndex, frame = null) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return
        this.pageIndex = pageIndex
        this.pageSelect.value = String(pageIndex)
        this.pendingFrame = frame
        this.selection.disable()
        this.viewer.open(this.pages[pageIndex].info_url)
    }

    pageOpened() {
        const frame = this.pendingFrame
        this.pendingFrame = null
        this.showBoxes()
        if (frame) this.zoomTo(frame)
    }

    // the selected region's box is editable when its page is in view; while adding, the page is ready to
    // be drawn on; the line's other regions on the page are outlined for context
    showBoxes() {
        if (!this.viewer || this.pageIndex === null || !this.viewer.world.getItemCount()) return
        this.refreshOtherRegions()
        const image = typeof this.active === 'number' ? this.images[this.active] : null

        if (image && image.uri === this.pages[this.pageIndex].image_uri) {
            const r = image.region
            const rect = this.viewer.viewport.imageToViewportRectangle(r.x, r.y, r.w, r.h)
            this.selection.rect = new OpenSeadragon.SelectionRect(rect.x, rect.y, rect.width, rect.height)
            this.selection.enable()
            this.selection.draw()
        } else if (this.active === 'new') {
            this.selection.rect = null
            this.selection.enable()
        } else {
            this.selection.disable()
        }
        this.updateInstructions()
        this.updateDragMode()
    }

    updateInstructions() {
        const image = typeof this.active === 'number' ? this.images[this.active] : null
        if (this.active === 'new') {
            this.instructionsEl.textContent = 'Drag on the page to draw a box around the new region (hold Shift to move the page instead).'
        } else if (image && this.pageIndex !== null && image.uri === this.pages[this.pageIndex].image_uri) {
            this.instructionsEl.textContent = 'Drag the box or its handles to adjust it; drag elsewhere to move the page.'
        } else if (image) {
            this.instructionsEl.textContent = `Region ${this.active + 1} is on page ${image.refNo}; select it to go back to it.`
        } else {
            this.instructionsEl.textContent = 'Select a region to adjust, or add one.'
        }
    }

    currentRegion() {
        if (!this.selection || !this.selection.rect) return null
        const rect = this.viewer.viewport.viewportToImageRectangle(this.selection.rect.normalize())
        return {x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), w: Math.round(rect.width), h: Math.round(rect.height)}
    }

    // when the mouse is released after drawing, moving, or resizing the box, update the region (or add
    // the one just drawn, which then becomes the selected region)
    commitBox() {
        if (this.active === null || this.pageIndex === null) return
        const region = this.currentRegion()
        if (!region || region.w < 2 || region.h < 2) return
        const page = this.pages[this.pageIndex]

        if (this.active === 'new') {
            this.images.push({
                uri: page.image_uri,
                refNo: page.ref_no,
                region: region,
                size: 'max',
                rotation: String(page.rotation || 0),
                quality: 'default.png',
            })
            this.active = this.images.length - 1
            this.showMessage('Region added.')
        } else {
            const image = this.images[this.active]
            if (image.uri !== page.image_uri) return
            // ignore releases that didn't change the box (e.g. after panning), allowing for rounding
            if (['x', 'y', 'w', 'h'].every(key => Math.abs(region[key] - image.region[key]) <= 1)) return
            image.region = region
            this.showMessage('Region updated.')
        }
        this.markDirty()
        this.renderList()
        this.refreshOtherRegions()
        this.updateInstructions()
        this.updateDragMode()
    }

    // show a region of the open page with some of the page around it
    zoomTo(region) {
        const rect = this.viewer.viewport.imageToViewportRectangle(region.x, region.y, region.w, region.h)
        const margin = Math.max(rect.width * .15, rect.height * 4)
        this.viewer.viewport.fitBounds(new OpenSeadragon.Rect(rect.x - margin, rect.y - margin, rect.width + margin * 2, rect.height + margin * 2), true)
    }

    // outline the line's other regions on this page, for context
    refreshOtherRegions() {
        if (!this.viewer || this.pageIndex === null || !this.viewer.world.getItemCount()) return
        this.viewer.clearOverlays()
        const uri = this.pages[this.pageIndex].image_uri
        this.images.forEach((image, index) => {
            if (image.unparseable || image.uri !== uri || index === this.active) return
            const r = image.region
            this.viewer.addOverlay({
                element: htmlToEl('<div class="lie-other-region"></div>'),
                location: this.viewer.viewport.imageToViewportRectangle(r.x, r.y, r.w, r.h),
            })
        })
    }

    // ------------------------------------------------------------------
    // SAVING
    // ------------------------------------------------------------------
    save() {
        const images = this.images.map(image => LineImageEditor.buildImageUrl(image))
        setDisabled(this.saveButton, true)
        fetch(`/api/corpus/${this.corpusId}/lineator/${this.playPrefix}/update/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken},
            body: JSON.stringify({action: 'set-line-images', line_id: this.line.lineId, images: images}),
        })
            .then(res => res.json())
            .then(result => {
                if (result.error) {
                    setDisabled(this.saveButton, false)
                    return this.showMessage(result.error, true)
                }
                this.dirty = false
                this.closing = true
                hideModal(this.modal)
                this.onSave(this.line.lineId, result.images)
            })
            .catch(() => {
                setDisabled(this.saveButton, false)
                this.showMessage('The images couldn\'t be saved.', true)
            })
    }

    showMessage(message, isError = false) {
        this.messageEl.textContent = message
        this.messageEl.className = `small me-auto lie-message ${isError ? 'text-danger' : 'text-success'}`
    }
}
