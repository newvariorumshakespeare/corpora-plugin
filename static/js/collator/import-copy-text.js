class CopyTextImporter {
    constructor(onLoad) {
        this.onLoad = onLoad
        this.modal = $('#import-copy-text-modal')
        this.buildModal()
        onLoad()
    }

    buildModal() {
        if (!this.modal.length) {
            $('body').prepend(`
                <!-- ADD WITNESS MODAL -->
                <div class="modal fade" id="import-copy-text-modal" tabindex="-1" role="dialog" aria-labelledby="import-copy-text-modal-label" aria-hidden="true">
                    <div class="modal-dialog modal-xl" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="import-copy-text-modal-label">Import Copy Text</h5>
                                <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close">
                                </button>
                            </div>
                            <form id="import-copy-text-form" method="post">
                                <div class="modal-body">    
                                    <input type="hidden" name="csrfmiddlewaretoken" value="${window.nvs.corpora.csrf_token}">
                                    <div class="form-group" id="import-copy-text-trans-project-div">
                                        <label for="import-copy-text-witness-selector">Witness</label>
                                        <select id="import-copy-text-witness-selector" class="form-select" name="import-copy-text-witness">
                                            <!-- populated via JavaScript -->
                                        </select>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                                    <button type="submit" id="import-copy-text-submit-button" class="btn btn-primary">Import</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `)
            this.modal = $('#import-copy-text-modal')
        }
    }

    import() {
        let witnessSelector = $('#import-copy-text-witness-selector')

        fetch(`${window.nvs.endpoints.collationLine}?f_play.id=${window.nvs.playID}&page-size=0&a_terms_sigla=witness.siglum`)
            .then(response => response.json())
            .then(siglaData => {
                let sigla = Object.keys(siglaData.meta.aggregations.sigla)
                let witnessSelector = $('#import-copy-text-witness-selector')

                window.nvs.orderedSigla.forEach(siglum => {
                    if (sigla.includes(siglum)) {
                        witnessSelector.append(`
                            <option value="${siglum}">
                                ${window.nvs.witnesses[siglum].siglum_label}
                            </option>
                        `)
                    }
                })
            })

        this.modal.modal('show')
    }
}