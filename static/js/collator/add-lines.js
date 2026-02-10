class LinesImporter {
    constructor(docID, onLoad) {
        this.docID = docID
        this.onLoad = onLoad
        this.modal = null
        this.buildModal()
    }

    buildModal() {

        $('body').prepend(`
            <!-- ADD WITNESS MODAL -->
            <div class="modal fade" id="add-${this.docID}-lines-modal" tabindex="-1" role="dialog" aria-labelledby="add-${this.docID}-lines-modal-label" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="add-${this.docID}-lines-modal-label">Add Lines from Witness</h5>
                            <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close">
                            </button>
                        </div>
                        <form id="add-${this.docID}-lines-form" method="post">
                            <div class="modal-body">    
                                <input type="hidden" name="csrfmiddlewaretoken" value="${window.nvs.corpora.csrf_token}">
        
                                <div class="form-group">
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="add-lines-method" id="add-${this.docID}-lines-method-trans-project" value="trans-project" checked>
                                        <label class="form-check-label" for="add-${this.docID}-lines-method-trans-project">Populate from Existing Transcription Project</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="add-lines-method" id="add-${this.docID}-lines-method-trans-file" value="trans-file">
                                        <label class="form-check-label" for="add-${this.docID}-lines-method-trans-file">Import from Transcription File</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="add-lines-method" id="add-${this.docID}-lines-method-manual-input" value="manual-input">
                                        <label class="form-check-label" for="add-${this.docID}-lines-method-manual-input">Manually Input Lines</label>
                                    </div>
                                </div>
                                <div class="form-group" id="add-${this.docID}-lines-trans-project-div">
                                    <label for="add-${this.docID}-lines-trans-project-selector">Transcription Project</label>
                                    <select id="add-${this.docID}-lines-trans-project-selector" class="form-select" name="add-lines-trans-project">
                                        <!-- populated via JavaScript -->
                                    </select>
                                </div>
                                <div class="form-group d-none" id="add-${this.docID}-lines-trans-file-div">
                                    <label for="add-${this.docID}-lines-transcription-filepond">Transcription File Upload</label>
                                    <input type="file" class="filepond" id="add-${this.docID}-lines-transcription-filepond">
                                    <input type="hidden" id="add-lines-transcription-file" name="add-lines-transcription-file" value="" />
                                </div>
                                <div class="form-group d-none" id="add-${this.docID}-lines-manual-input-div">
                                    <label for="add-${this.docID}-lines-num-lines-box">Number of Lines in Play</label>
                                    <input type="number" class="form-control" id="add-${this.docID}-lines-num-lines-box" name="add-lines-num-playlines">
                                </div>
                            
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                                <button type="submit" id="add-${this.docID}-lines-submit-button" class="btn btn-primary">Go</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `)
        this.modal = $(`#add-${this.docID}-lines-modal`)

        // CREATE FILE POND FOR IMPORT DOCUMENT FILES (SELECT FILE) MODAL
        const import_transcription_file_pond = FilePond.create(document.querySelector(`#add-${this.docID}-lines-transcription-filepond`), {
            allowMultiple: false,
            allowRevert: true,
            chunkUploads: true,
            chunkSize: 500000,
            credits: false,
            server: {
                url: '/fp',
                process: '/process/',
                patch: '/patch/',
                revert: '/revert/',
                fetch: '/fetch/?target=',
                headers: {'X-CSRFToken': window.nvs.corpora.csrf_token},
            }
        })
        import_transcription_file_pond.on('processfile', (error, file) => {
            if(!error) {
                import_files.push(file.serverId)
                let import_button = $('#file-upload-import-button')
                import_button.attr('disabled', false)
            }
        })

        let sender = this
        window.nvs.corpora.list_content(
            window.nvs.corpus.id,
            'TranscriptionProject',
            {
                'f_document.id': sender.docID,
                's_name': 'asc'
            },
            function(transProjectData) {
                if (transProjectData.records) {
                    let transProjectSelector = $(`#add-${sender.docID}-lines-trans-project-selector`)

                    transProjectData.records.forEach(transProject => {
                        transProjectSelector.append(`
                            <option value="${transProject.id}">${transProject.name}</option>
                        `)

                        $(`input[type=radio][name=add-${sender.docID}-lines-method]`).change(function () {
                            let transProjectDiv = $(`#add-${sender.docID}-lines-trans-project-div`)
                            let transFileDiv = $(`#add-${sender.docID}-lines-trans-file-div`)
                            let manualInputDiv = $(`#add-${sender.docID}-lines-manual-input-div`)

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