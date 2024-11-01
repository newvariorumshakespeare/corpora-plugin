class SearchManager {
    constructor(config) {
        // register configuration
        this.configure('play', 'wt', config)
        this.configure('host', 'corpora.dh.tamu.edu', config)
        this.configure('corpusID', '5f3d7c81cfcceb0074aa7f55', config)
        this.configure('templatesPath', '/static/templates', config)
        this.configure('playViewer', null, config)
        this.configure('commViewer', null, config)

        this.searchEndpoint = `${this.host}/api/corpus/${this.corpusID}/nvs-search/${this.play}/`
        this.searchMarker = null
        this.nvsSearch = null
        this.rigUpEvents()
    }

    rigUpEvents() {
        let quickSearchBox = getEl('hdr-quick-search-box')
        getCollapse(getEl('hdr-quick-search-drawer'), {toggle: false})

        quickSearchBox.onfocus = (e) => {
            this.enterSearchMode()
        }

        getEl('playtext-search-close-button').onclick = (e) => {
            this.exitSearchMode()
        }

        window.onkeydown = (e) => {
            if ((e.keyCode === 70 && (e.ctrlKey || e.metaKey )) || (e.keyCode === 191)) {
                this.enterSearchMode()
                quickSearchBox.focus()
            }
        }

        quickSearchBox.onkeydown = (e) => {
            if (e.which === 13) {
                showLoadingModal()
                let query = quickSearchBox.innerHTML.trim().replace(/(<([^>]+)>)/gi, " ")

                quickSearchBox.innerHTML = query

                let searchType = getElWithQuery('input[name="search-type"]:checked').value
                let searchContents = []
                if (getEl('search-playtext').checked) searchContents.push('playtext')
                if (getEl('search-variants').checked) searchContents.push('variants')
                if (getEl('search-commentary').checked) searchContents.push('commentary')
                searchContents = searchContents.join()

                let searchParams = new URLSearchParams()
                searchParams.append('quick_search', query)
                searchParams.append('search_type', searchType)
                searchParams.append('search_contents', searchContents)

                let sender = this
                fetch(`${this.searchEndpoint}?${searchParams.toString()}`)
                    .then(resp => resp.json())
                    .then(searchResults => sender.processSearchResults(searchResults))


                return false;
            } else if (e.key === "Escape") {
                this.exitSearchMode()
                return false;
            }
        }
    }

    enterSearchMode() {
        let quickSearchBox = getEl('hdr-quick-search-box')
        let quickSearchDrawer = getEl('hdr-quick-search-drawer')
        let playTextHeaderLabel = getEl('playtext-header-label')
        let playTextSearchCol = getEl('playtext-search-tln-col')
        let variantHeaderCol = getEl('variant-header-col')
        let commentaryHeaderCol = getEl('commentary-header-col')
        let playTextSearchCloseButton = getEl('playtext-search-close-button')
        let playTextSearchDiv = getEl('playtext-search-div')

        playTextHeaderLabel.classList.add('d-none')
        playTextSearchDiv.classList.add('w-100')
        quickSearchBox.style.width = '100%'
        quickSearchBox.classList.add('not-empty')
        playTextSearchCol.classList.remove('align-items-center')
        playTextSearchCol.classList.add('align-items-top')
        variantHeaderCol.classList.remove('align-items-center')
        variantHeaderCol.classList.add('align-items-end')
        variantHeaderCol.classList.add('pb-2')
        commentaryHeaderCol.classList.remove('align-items-center')
        commentaryHeaderCol.classList.add('align-items-end')
        commentaryHeaderCol.classList.add('pb-2')
        getCollapse(quickSearchDrawer).toggle('show')
        playTextSearchCloseButton.classList.remove('d-none')

        document.documentElement.style.setProperty(
            '--nvs-playtext-viewport-size',
            `calc(100vh - 150px)`
        )
    }

    exitSearchMode() {
        let playtextSearchCol = getEl('playtext-search-tln-col')
        let variantHeaderCol = getEl('variant-header-col')
        let commentaryHeaderCol = getEl('commentary-header-col')
        let quickSearchBox= getEl('hdr-quick-search-box')
        let quickSearchDrawer = getEl('hdr-quick-search-drawer')
        let searchWidget = getEl('search-widget')

        getEl('playtext-header-label').classList.remove('d-none')
        getEl('playtext-search-div').classList.remove('w-100')
        getEl('playtext-search-close-button').classList.add('d-none')
        quickSearchBox.style.width = '100px'
        quickSearchBox.classList.remove('not-empty')
        quickSearchBox.innerHTML = ''
        quickSearchBox.blur()
        playtextSearchCol.classList.add('align-items-center')
        playtextSearchCol.classList.remove('align-items-top')
        variantHeaderCol.classList.add('align-items-center')
        variantHeaderCol.classList.remove('align-items-end')
        variantHeaderCol.classList.remove('pb-2')
        commentaryHeaderCol.classList.add('align-items-center')
        commentaryHeaderCol.classList.remove('align-items-end')
        commentaryHeaderCol.classList.remove('pb-2')
        getCollapse(quickSearchDrawer).toggle('hide')
        document.documentElement.style.setProperty(
            '--nvs-playtext-viewport-size',
            `calc(100vh - 90px)`
        )

        if (this.nvsSearch !== null) {
            Object.keys(this.nvsSearch.search_markers).forEach(markerKey => {
                this.nvsSearch.search_markers[markerKey].unmark()
            })
        }
        if (searchWidget) searchWidget.classList.add('d-none')

        /*corpora.make_request(
            search_endpoint,
            'GET',
            {
                clear: true
            },
            function() {
                $(":root").css("--scrollbarURL", `url(${minimap_url}?width=40&height=${parseInt(getEl('playtext-col").height())}&no-cache=${Math.floor(Date.now() / 1000)})`);
            }
        )*/
    }

    processSearchResults(searchResults) {
        let searchWidget = getEl('search-widget')
        if (!searchWidget) {
            let sender = this
            fetch(`${this.templatesPath}/search-widget.html`)
                .then(html => html.text())
                .then(html => {
                    appendToEl(document.body, html)

                    let types = ['line', 'variant', 'commentary']
                    let whiches = ['prev', 'next']
                    types.forEach(type => {
                        whiches.forEach(which => {
                            getEl(`search-${type}-${which}`).onclick = (e) => sender.displaySearchResult(type, which)
                        })
                    })
                    forElsMatching('.nav-pills .nav-link', (el) => {
                        getTab(el)
                        el.addEventListener('shown.bs.tab', (e) => {
                            let type = e.target.dataset.search_type
                            sender.nvsSearch[`current_${type}_result`] = 0;
                            sender.displaySearchResult(type, 'next')
                        })
                    })

                    getEl('search-widget-close-button').onclick = (e) => {
                        this.exitSearchMode()
                    }

                    sender.processSearchResults(searchResults)
                    return true
                })
            return
        }

        searchWidget.classList.remove('d-none');

        //document.documentElement.style.setProperty("--scrollbarURL", `url(${minimap_url}?width=40&height=${parseInt(getEl('playtext-col').height())}&no-cache=${Math.floor(Date.now() / 1000)})`)
        if (this.nvsSearch) {
            forElsMatching('mark', (el) => el.remove())
        }

        this.nvsSearch = {
            character_results: searchResults.characters,
            line_results: searchResults.lines,
            variant_results: searchResults.variants,
            commentary_results: searchResults.commentaries,
            current_line_result: 0,
            current_variant_result: 0,
            current_commentary_result: 0,
            search_markers: {}
        }

        forElsMatching('.search-line-current', (el) => el.innerHTML = '0')
        forElsMatching('.search-line-current', (el) => el.innerHTML = '0')
        forElsMatching('.search-variant-current', (el) => el.innerHTML = '0')
        forElsMatching('.search-commentary-current', (el) => el.innerHTML = '0')
        forElsMatching('.search-line-total', (el) => el.innerHTML = this.nvsSearch.line_results.length)
        forElsMatching('.search-variant-total', (el) => el.innerHTML = this.nvsSearch.variant_results.length)
        forElsMatching('.search-commentary-total', (el) => el.innerHTML = this.nvsSearch.commentary_results.length)
        getEl('search-line-prev').classList.remove('d-none')
        getEl('search-line-next').classList.remove('d-none')
        getEl('search-variant-prev').classList.remove('d-none')
        getEl('search-variant-next').classList.remove('d-none')
        getEl('search-commentary-prev').classList.remove('d-none')
        getEl('search-commentary-next').classList.remove('d-none')

        let boxRect = getEl('hdr-quick-search-box').getBoundingClientRect()

        searchWidget.style.top = `${boxRect.top + window.pageYOffset + 50}px`
        searchWidget.style.left = `${boxRect.left + boxRect.width - 50}px`
        makeDraggable(searchWidget, getElWithQuery(`#${searchWidget.id} .ref-modal-header`))

        if (this.nvsSearch.line_results.length) this.displaySearchResult('line', 'next')
        else if (this.nvsSearch.variant_results.length) this.displaySearchResult('variant', 'next')
        else if (this.nvsSearch.commentary_results.length) this.displaySearchResult('commentary', 'next')
        else displayNavModal('No results.', 'No results for your search term were found.', null)

        hideLoadingModal()
    }

    displaySearchResult(type, which) {
        getTab(getEl(`search-widget-${type}-tab`)).show()

        if (which === 'next') {
            this.nvsSearch[`current_${type}_result`] += 1
            if (this.nvsSearch[`current_${type}_result`] > this.nvsSearch[`${type}_results`].length) {
                this.nvsSearch[`current_${type}_result`] = 1
            }
        } else this.nvsSearch[`current_${type}_result`] -= 1

        let result = this.nvsSearch[`${type}_results`][this.nvsSearch[`current_${type}_result`] - 1]

        let adjustUI = () => {
            getEl(`search-${type}-current`).innerHTML = this.nvsSearch[`current_${type}_result`]
            if (this.nvsSearch[`current_${type}_result`] === 1) {
                getEl(`search-${type}-prev`).classList.add('d-none');
            } else {
                getEl(`search-${type}-prev`).classList.remove('d-none');
            }

            if (this.nvsSearch[`${type}_results`].length === 1) {
                getEl(`search-${type}-next`).classList.add('d-none');
            } else {
                getEl(`search-${type}-next`).classList.remove('d-none');
            }
        }

        let markUp = (domain, matches, config={}) => {
            let markerKey = `${type}-${which}-${this.nvsSearch[`current_${type}_result`]}`
            let existentMarks = getElsWithQuery(`${domain} mark`)
            if (existentMarks.length === 0) {
                this.nvsSearch.search_markers[markerKey] = new Mark(domain)
                matches.forEach(match => this.nvsSearch.search_markers[markerKey].mark(match, config))
            }
        }

        if (type === 'line') {
            this.playViewer.navigateTo(result.xml_id, false, () => {
                markUp(`#${result.xml_id}-text-col`, result.matches)
                adjustUI()
            })
        } else if (type === 'variant') {
            this.playViewer.navigateTo(result.xml_id, true, () => {
                markUp(
                    `#${result.xml_id}-variant-div .variant-words`,
                    result.matches
                )
                adjustUI()
            })
        }
        if (type === 'commentary') {
            this.commViewer.navigateTo(result.comm_id, () => {
                let result_num = this.nvsSearch.current_commentary_result - 1
                console.log(`commentary-note-${result.comm_id}`)
                markUp(
                    `#commentary-container-${result.comm_id}`,
                    result.matches,
                    {className: `search-commentary-result-${result_num}`}
                )
                adjustUI()
                let commMarks = getElsWithQuery(`.search-commentary-result-${result_num}`)
                if (commMarks.length) commMarks[0].scrollIntoView({behavior: 'smooth'})
            })
        }


    }

    configure(setting, default_value, config) {
        if (setting in config) this[setting] = config[setting]
        else this[setting] = default_value
    }
}