class TEIGenerator {
    constructor() {
        this.modal = $('tei-modal')
        this.buildModal()
        this.teiEditor = null
        this.editorSession = null
        this.noteTemplate = (p) => `
    <note type="textual" xml:id="tn_${p.counter}" target="#${p.tln}">
        <label>${p.tln.replace('tln_', '').replace('dpln_', '')}</label>
        <app>
            ${p.appParts}
        </app>
    </note>
        `
        this.appPartTemplate = (p) => `<appPart>
                <rdg type="replace">${p.text}</rdg>
                <wit>${p.siglaTags}</wit>
            </appPart>`
    }

    generate() {
        this.modal.modal('show')
        let noteCounter = 0

        // setup the editor for editing tei
        this.teiEditor = ace.edit("tei-editor")
        this.teiEditor.setTheme("ace/theme/monokai")
        this.editorSession = this.teiEditor.getSession()
        this.editorSession.setMode("ace/mode/xml")

        window.nvs.tlns.forEach(tln => {
            if (window.nvs.visibleTLNs.includes(tln)) {
                let variants = {}
                let orderedVariants = []

                window.nvs.orderedSigla.forEach(siglum => {
                    let cell = $(`#${siglum}-${tln.replace('.', '\.')}`)
                    if (cell.length) {
                        let diffs = cell.find('span.difference')
                        if (diffs.length) {
                            let text = cell.text().trim()
                            if (!(text in variants)) {
                                variants[text] = []
                                orderedVariants.push(text)
                            }
                            variants[text].push(siglum)
                        }
                    }
                })

                if (orderedVariants.length) {
                    let appParts = []
                    orderedVariants.forEach(variant => {
                        let siglaTags = []
                        variants[variant].forEach(siglum => {
                            siglaTags.push(`<siglum rend="smcaps">${siglum.replace('s_', '')}</siglum>`)
                        })

                        appParts.push(this.appPartTemplate({
                            text: variant,
                            siglaTags: siglaTags.join(', ')
                        }))
                    })
                    let note = this.noteTemplate({
                        counter: noteCounter,
                        tln: tln,
                        appParts: appParts.join('\n\t\t\t')
                    })
                    this.appendToEditor(note)
                    noteCounter += 1
                }
            }
        })
    }

    appendToEditor(xml) {
        let lastRow = this.editorSession.getLength()
        this.editorSession.insert({
            row: lastRow,
            column: 0
        }, xml)
    }
    
    buildModal() {
        if (!this.modal.length) {
            $('body').prepend(`
                <!-- ADD WITNESS MODAL -->
                <div class="modal fade" id="tei-modal" tabindex="-1" role="dialog" aria-labelledby="tei-modal-label" aria-hidden="true">
                    <div class="modal-dialog modal-xl" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="tei-modal-label">TEI</h5>
                                <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close">
                                </button>
                            </div>
                            <div class="modal-body">    
                                <div id="tei-editor" style="height: 80vh;"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            `)
            this.modal = $('#tei-modal')
        }
    }
}