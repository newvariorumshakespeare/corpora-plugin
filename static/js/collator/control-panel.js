class ControlPanel {
    constructor(startingTLN, endingTLN) {
        this.panel = $('#control-panel')
        this.teiGenerator = new TEIGenerator()

        // determine the previous page's starting tln
        let currentStartingIndex = window.nvs.tlns.indexOf(startingTLN)
        let previousStartingIndex = currentStartingIndex - window.nvs.maxLines
        if (previousStartingIndex < 0) previousStartingIndex = 0
        let previousStartingTLN = window.nvs.tlns[previousStartingIndex]

        this.panel.append(`
            <div class="row g-0 justify-content-between p-2" style="background-color:#6c9ecc; height: 40px;!important">
                <div class="col">
                    <button id="add-witness-button" class="btn btn-sm control-panel-button" disabled>Add Witness</button>
                    <button id="import-copytext-button" class="btn btn-sm control-panel-button" disabled>Import Copy Text</button>
                    <button id="generate-tei-button" class="btn btn-sm control-panel-button">Generate TEI</button>
                </div>
                <div class="col">
                    <div class="row g-0 justify-content-end">
                        <div class="col-auto">
                            <div class="input-group">
                                <input type="text" id="cp-go-to-tln-box" class="form-control form-control-sm control-panel-input" value="${startingTLN}" style="width: 150px; flex-grow: 0;">
                                <button id="cp-go-to-tln-button" class="btn btn-sm control-panel-button me-2">Go</button>
                            </div>
                        </div>
                        <div class="col-auto">
                            <a
                                href="?starting-tln=${previousStartingTLN}"
                                class="btn btn-sm control-panel-button"
                                data-toggle="tooltip"
                                data-placement="top" title="Previous TLNs"><span class="fas fa-step-backward"></span></a>
                            <a
                                href="?starting-tln=${endingTLN}"
                                class="btn btn-sm control-panel-button"
                                data-toggle="tooltip"
                                data-placement="top" title="Next TLNs"><span class="fas fa-step-forward"></span></a>
                        </div>
                    </div>
                    
                </div>
            </div>
            <div id="cp-body" class="container-fluid"></div>
        `)
        this.panelBody = $('#cp-body')
        let sender = this

        this.witnessImporter = new WitnessImporter(() => {
            let addWitnessButton = $('#add-witness-button')
            addWitnessButton.removeAttr('disabled')
            addWitnessButton.off('click').on('click', () => {
                this.witnessImporter.import()
            })
        })

        if (!window.nvs.copyTextEstablished) {
            this.copyTextImporter = new CopyTextImporter(() => {
                let importCopyTextButton = $('#import-copytext-button')
                importCopyTextButton.removeAttr('disabled')
                importCopyTextButton.click(() => this.copyTextImporter.import())
            })
        }

        $('#generate-tei-button').click(function() { sender.teiGenerator.generate() })

        $('#cp-go-to-tln-button').click(function() {
            let targetTLN = $('#cp-go-to-tln-box').val().trim()
            if (window.nvs.tlns.includes(targetTLN)) window.location.href=`?starting-tln=${targetTLN}`
        })
    }

    editLine(collationCell) {
        let siglum = collationCell.data('siglum')
        let tln = collationCell.data('tln')
        let text = collationCell.data('text')
        let prevTLN = collationCell.data('prev_tln')
        let nextTLN = collationCell.data('next_tln')

        $('td.editing').removeClass('editing')
        collationCell.addClass('editing')
        $('#cp-edit-collation-line-siglum').val(siglum)
        $('#cp-edit-collation-line-tln').val(tln)

        this.panel.addClass('expanded')
        this.panelBody.empty()
        this.panelBody.append(`
            <div class="row g-0 p-2 mt-3">
                <div class="col-sm-7">
                    <label for="cp-text-box" class="sr-only">Edit Text</label>
                    <div class="input-group">
                        <input id="cp-text-box" class="form-control" type="text">
                        <button id="cp-edit-text-button" class="btn btn-primary">Edit Text</button>
                    </div>
                </div>
                <div class="col-sm-5 ps-2">
                    <label for="cp-tln-box" class="sr-only">Edit Lineation</label>
                    <div class="input-group">
                        <input id="cp-tln-box" type="text" class="form-control">
                        <button id="cp-relineate-button" class="btn btn-primary">Edit Lineation</button>
                    </div>
                </div>
            </div>
            <div class="row g-0 p-2 justify-content-end">
                <div class="col-sm-5 ps-2">
                    <label for="cp-merge-selector" class="sr-only">Merge Line</label>
                    <div class="input-group">
                        <select id="cp-merge-selector" class="form-select">
                            ${prevTLN ? `<option value="${prevTLN}">This line into ${prevTLN}</option>` : ''}
                            ${nextTLN ? `<option value="${nextTLN}">This line into ${nextTLN}</option>` : ''}
                        </select>
                        <button id="cp-tln-edit-text-button" class="btn btn-primary">Merge</button>
                    </div>
                </div>
            </div>
        `)

        let tlnBox = $('#cp-tln-box')
        let textBox = $('#cp-text-box')
        let editTextButton = $('#cp-edit-text-button')
        let relineateButton = $('#cp-relineate-button')
        let editLineForm = $('#cp-edit-line-form')

        tlnBox.val(tln)
        if (text) {
            textBox.val(text)
        }

        editTextButton.click(function() {
            editLineForm.append(`<input type="hidden" name="edit-collation-line-text" value="${textBox.val()}" />`)
            editLineForm.submit()
        })
        relineateButton.click(function() {
            editLineForm.append(`<input type="hidden" name="edit-collation-line-new-tln" value="${tlnBox.val()}" />`)
            editLineForm.submit()
        })
    }
}