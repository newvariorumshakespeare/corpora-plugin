class LinesImporter {
    constructor(siglum, onLoad) {
        this.siglum = siglum
        this.onLoad = onLoad
        this.witRow = $(`#collation-grid-siglum-row-${this.siglum}`)
        this.modal = null
        this.collationStatus = null
        this.importJob = null

        this.witRow.addClass('missing-witness-row')

        let sender = this
        window.nvs.corpora.list_content(
            window.nvs.corpus.id,
            'Reference',
            {
                'f_document.siglum': sender.siglum,
                'f_play.id': window.nvs.playID,
                'only': 'collation_status'
            },
            function(referenceData) {
                if (referenceData.records && referenceData.records.length === 1) {
                    sender.collationStatus = referenceData.records[0].collation_status
                }

                if (!sender.collationStatus) {
                    sender.witRow.append(`
                        <td colspan="${Math.min(window.nvs.maxLines, Object.keys(window.nvs.lines).length)}">
                            <span id="missing-siglum-message-${sender.siglum}" class="missing-siglum-status">
                                Click the "Import" button on the left sidebar to import lines from a transcription project.
                            </span>
                        </td>
                    `)
                }

                if (sender.collationStatus && sender.collationStatus.startsWith('Importing:')) {
                    console.log('importing...')
                    sender.importJob = sender.collationStatus.split(' ')[1]
                    window.nvs.corpus.event_callbacks['job'] = function(job) {
                        console.log(job)
                    }
                }
            }
        )

        this.buildModal()
    }

    buildModal() {

        $('body').prepend(`
            <!-- ADD WITNESS MODAL -->
            <div class="modal fade" id="add-${this.siglum}-lines-modal" tabindex="-1" role="dialog" aria-labelledby="add-${this.siglum}-lines-modal-label" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="add-${this.siglum}-lines-modal-label">Add Lines from Witness</h5>
                            <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close">
                            </button>
                        </div>
                        <form id="add-${this.siglum}-lines-form" method="post">
                            <div class="modal-body">    
                                <input type="hidden" name="csrfmiddlewaretoken" value="${window.nvs.corpora.csrf_token}">
                                <input type="hidden" name="add-lines-method" value="trans-project">
                                
                                <div class="form-group" id="add-${this.siglum}-lines-trans-project-div">
                                    <label for="add-${this.siglum}-lines-trans-project-selector">Transcription Project</label>
                                    <select id="add-${this.siglum}-lines-trans-project-selector" class="form-select" name="add-lines-trans-project">
                                        <!-- populated via JavaScript -->
                                    </select>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                                <button type="submit" id="add-${this.siglum}-lines-submit-button" class="btn btn-primary">Go</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `)
        this.modal = $(`#add-${this.siglum}-lines-modal`)

        let sender = this
        window.nvs.corpora.list_content(
            window.nvs.corpus.id,
            'TranscriptionProject',
            {
                'f_document.siglum': sender.siglum,
                's_name': 'asc'
            },
            function(transProjectData) {
                if (transProjectData.records) {
                    let transProjectSelector = $(`#add-${sender.siglum}-lines-trans-project-selector`)

                    transProjectData.records.forEach(transProject => {
                        transProjectSelector.append(`
                            <option value="${transProject.id}">${transProject.name}</option>
                        `)

                        $(`input[type=radio][name=add-${sender.siglum}-lines-method]`).change(function () {
                            let transProjectDiv = $(`#add-${sender.siglum}-lines-trans-project-div`)
                            let transFileDiv = $(`#add-${sender.siglum}-lines-trans-file-div`)
                            let manualInputDiv = $(`#add-${sender.siglum}-lines-manual-input-div`)

                            transProjectDiv.addClass('d-none')
                            transFileDiv.addClass('d-none')
                            manualInputDiv.addClass('d-none')

                            if (this.value === 'trans-project') {
                                transProjectDiv.removeClass('d-none')
                            } else if (this.value === 'trans-file')
                                transFileDiv.removeClass('d-none')
                            else if (this.value === 'manual-input')
                                manualInputDiv.removeClass('d-none')
                         })
                    })
                }
                sender.onLoad()
            }
        )
    }

    import() {
        this.modal.modal('show')
    }
}