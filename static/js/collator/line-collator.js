class LineCollator {
    constructor() {
        this.lineObserver = new IntersectionObserver(function(entries) {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    let line = $(entry.target)
                    if (!line.attr('data-collated')) {
                        let tln = line.data('tln')
                        let siglum = line.data('siglum')
                        let docID = window.nvs.witnesses[siglum].document_id

                        window.nvs.corpora.make_request(
                            `${window.nvs.endpoints.differ}`,
                            'POST',
                            {
                                'copy-text': window.nvs.lines[tln].text,
                                'tln': tln,
                                'siglum': siglum,
                                'doc-id': docID
                            },
                            (diff) => {
                                line.html(`
                                    <span id="${siglum}-${tln}-html" class="play-line">${diff.html}</span>
                                `)
                                line.data('text', diff.text)

                                setTimeout(() => {
                                    let textSpan = $(`#${siglum}-${tln.replaceAll('.', '\\.')}-html`)
                                    if (textSpan.length) {
                                        if (diff.image.startsWith('/corpora')) diff.image = `/iiif/2${diff.image}`

                                        let imageSrc = `${diff.image}${parseInt(textSpan.width())},/0/default.png`
                                        line.append(`<img class="d-block" src="${imageSrc}"/>`)
                                    }
                                }, 1000)

                                window.nvs.diffedCells.add(`${siglum}-${tln}`)
                            }
                        )

                        line.attr('data-collated', 'y')
                    }
                }
            })
        })
        let sender = this

        setTimeout(() => {
            $('.collate-me').each(function () {
                sender.lineObserver.observe(this)
            })
        }, 1000)
    }
}