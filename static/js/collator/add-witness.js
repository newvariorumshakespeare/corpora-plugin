class WitnessImporter {
    constructor(onLoad) {
        this.onLoad = onLoad
        this.modal = $('#add-witness-modal')
        this.buildModal()
        onLoad()
    }

    buildModal() {
        if (!this.modal.length) {
            $('body').prepend(`
                <!-- ADD WITNESS MODAL -->
                <div class="modal fade" id="add-witness-modal" tabindex="-1" role="dialog" aria-labelledby="add-witness-modal-label" aria-hidden="true">
                    <div class="modal-dialog modal-xl" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="add-witness-modal-label">Add Witness</h5>
                                <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close">
                                </button>
                            </div>
                            <form id="add-witness-form" method="post">
                                <div class="modal-body">    
                                    <input type="hidden" name="csrfmiddlewaretoken" value="${window.nvs.corpora.csrf_token}">
                                    <input type="hidden" id="add-witness-document-id" name="add-witness-document-id" />
                                    
                                    <div class="form-group">
                                        <label>Type of Collated Edition</label>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" name="add-witness-type" id="add-witness-type-fully-collated" value="fully-collated" checked>
                                            <label class="form-check-label" for="add-witness-type-fully-collated">Fully Collated</label>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" name="add-witness-type" id="add-witness-type-occasionally-collated" value="occasionally-collated">
                                            <label class="form-check-label" for="add-witness-type-occasionally-collated">Occassionally Collated</label>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group" id="add-witness-document-div">
                                        <!-- Document Selection Table Here -->
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `)
            this.modal = $('#add-witness-modal')
        }
    }

    import() {
        let docSelectionDiv = $('#add-witness-document-div')
        let docSelectionIdInput = $('#add-witness-document-id')

        docSelectionIdInput.val('')
        docSelectionDiv.empty()

        let docSelectionTable = new ContentTable({
            label: 'NVS Library of Works',
            container_id: docSelectionDiv[0].id,
            corpora: window.nvs.corpora,
            corpus: window.nvs.corpus,
            mode: 'select',
            min_height: 300,
            give_search_focus: true,
            content_type: 'Document',
            selection_callback: (doc) => {
                if (doc.id) {
                    let witnessSelectionForm = $('#add-witness-form')
                    docSelectionIdInput.val(doc.id)
                    witnessSelectionForm.submit()
                }
            }
        })
        this.modal.modal('show')
    }
}