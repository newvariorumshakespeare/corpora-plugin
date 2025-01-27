export class SearchManager {
    constructor() {
        this.templatesPath = window.nvs.staticPath + '/templates'
        this.nvsSearch = null
        this.characters = []
        this.lineSpeakers = {}
        this.selectedScenes = new Set()
        this.selectedCharacters = new Set()
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
                fetch(`${window.nvs.endpoints.search}?${searchParams.toString()}`)
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

        let sender = this
        fetch(`${window.nvs.endpoints.search}?clear=true`)
            .then(() => {
                window.nvs.playViewer.renderMiniMap(true)
            })
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
        window.nvs.playViewer.renderMiniMap(true)
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
            window.nvs.playViewer.navigateTo(result.xml_id, false, () => {
                markUp(`#${result.xml_id}-text-col`, result.matches)
                adjustUI()
            })
        } else if (type === 'variant') {
            window.nvs.playViewer.navigateTo(result.xml_id, true, () => {
                markUp(
                    `#${result.xml_id}-variant-div .variant-words`,
                    result.matches
                )
                adjustUI()
            })
        }
        if (type === 'commentary') {
            window.nvs.playViewer.commViewer.navigateTo(result.comm_id, () => {
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

    async filterLines() {
        let filterWidget = getEl('filter-widget')

        // if the filter widget doesn't exist yet, we need to grab the
        // template, add it to the DOM, and rig up some events
        if (!filterWidget) {
            let sender = this
            fetch(`${this.templatesPath}/filter-widget.html`)
                .then(html => html.text())
                .then(html => {
                    appendToEl(document.body, html)
                    filterWidget = getEl('filter-widget')

                    // filter apply button click
                    getEl('filter-apply-button').onclick = (e) => {
                        let sceneFiltered = this.selectedScenes.size !== window.nvs.playViewer.actScenes.length
                        let charFiltered = this.selectedCharacters.size !== this.characters.length

                        forElsMatching('.play-row', (el) => {
                            let meetsSceneCriteria = false
                            let meetsCharCriteria = false

                            if (sceneFiltered) meetsSceneCriteria = this.selectedScenes.has(el.dataset.actscene)
                            else meetsSceneCriteria = true

                            if (charFiltered) {
                                let lineChars = this.lineSpeakers[parseInt(el.dataset.line_number)]
                                meetsCharCriteria = lineChars && lineChars.isSubsetOf(this.selectedCharacters)
                            } else meetsCharCriteria = true

                            if (meetsSceneCriteria && meetsCharCriteria) {
                                el.classList.remove('d-none')
                            } else {
                                el.classList.add('d-none')
                            }

                        })

                        if (sceneFiltered || charFiltered) {
                            window.nvs.playViewer.disableMiniMap()
                            window.nvs.playViewer.isFiltered = true
                        }
                        else {
                            window.nvs.playViewer.renderMiniMap()
                            window.nvs.playViewer.isFiltered = false
                        }
                        filterWidget.classList.add('d-none')
                        setTimeout(() => {
                            window.nvs.playViewer.renderActSceneNav()
                            window.nvs.playViewer.render()
                        }, 500)
                    }

                    // filter close button
                    getEl('filter-widget-close-button').onclick = (e) => {filterWidget.classList.add('d-none')}

                    // handle the "ALL" checkbox for characters/scenes
                    getEl('line-filter-all-chars').onchange = (e) => {
                        forElsMatching('.filter-char-checkbox', (el) => {
                            if (e.target.checked) {
                                el.checked = true
                                this.selectedCharacters.add(el.dataset.xml_id)
                            } else {
                                el.checked = false
                                this.selectedCharacters.delete(el.dataset.xml_id)
                            }
                        })
                        getEl('filter-apply-button').classList.remove('d-none')
                    }
                    getEl('line-filter-all-scenes').onchange = (e) => {
                        forElsMatching('.filter-scene-checkbox', (el) => {
                            if (e.target.checked) {
                                el.checked = true
                                this.selectedScenes.add(el.dataset.scene)
                            } else {
                                el.checked = false
                                this.selectedScenes.delete(el.dataset.scene)
                            }
                        })
                        getEl('filter-apply-button').classList.remove('d-none')
                    }

                    // since all of this adding HTML to the DOM and rigging up events takes place inside an
                    // asynchronous "fetch," let's just recursively call filterLines once it's done to continue
                    sender.filterLines()
                })

            return
        }

        // now that we have the HTML and initial events rigged up, let's make sure we have the data we
        // need to be able to filter characters and lines

        // get  character data, rig up HTML and events if necessary
        if (this.characters.length === 0) {
            let charQuery = `${window.nvs.endpoints.speech}?a_terms_speakers=speaking.name,speaking.xml_id&f_play.prefix=${window.nvs.play}&only=speaking.xml_id,lines.line_number&page-size=5000`

            const response = await fetch(charQuery)
            let speechData = await response.json()

            if (hasProp(speechData, 'meta.aggregations.speakers')) {
                this.characters = Object.keys(speechData.meta.aggregations.speakers).sort().map(nameIDs => {
                    let [name, xml_id] = nameIDs.split('|||')
                    return {
                        'name': name,
                        'xml_id': xml_id,
                        'speeches': speechData.meta.aggregations.speakers[nameIDs]
                    }
                })
                speechData.records.forEach(speech => {
                    let lineNos = speech.lines.map(l => l.line_number)
                    let speakers = speech.speaking.map(s => s.xml_id)

                    lineNos.forEach(lineNo => {
                        if (!(lineNo in this.lineSpeakers)) this.lineSpeakers[lineNo] = new Set()
                        speakers.forEach(speaker => this.lineSpeakers[lineNo].add(speaker))
                    })
                })
            }
            let charHTML = ''
            this.characters.forEach(char => {
                this.selectedCharacters.add(char.xml_id)
                charHTML += `
                    <div class="row">
                        <div class="col-sm-8 form-check">
                            <input id="line-filter-char-${char.xml_id}" type="checkbox" class="form-check-input filter-char-checkbox" data-xml_id="${char.xml_id}" checked>
                            <label for="line-filter-char-${char.xml_id}" class="form-check-label checkbox-white">${char.name}</label>
                        </div>
                        <div class="col-sm-4">${char.speeches}</div>
                    </div>
                `
            })
            appendToEl(getEl('filter-widget-characters'), charHTML)
            forElsMatching('.filter-char-checkbox', (el) => {
                el.onchange = (e) => {
                    if (e.target.checked) this.selectedCharacters.add(e.target.dataset.xml_id)
                    else {
                        getEl('line-filter-all-chars').checked = false
                        this.selectedCharacters.delete(e.target.dataset.xml_id)
                    }

                    getEl('filter-apply-button').classList.remove('d-none')
                }
            })

            let actSceneHTML = ''
            window.nvs.playViewer.actScenes.forEach(actScene => {
                this.selectedScenes.add(actScene)
                actSceneHTML += `
                    <div class="row">
                        <div class="col-sm-12 form-check">
                            <input id="line-filter-scene-${actScene}" type="checkbox" class="form-check-input filter-scene-checkbox" data-scene="${actScene}" checked>
                            <label for="line-filter-scene-${actScene}" class="form-check-label checkbox-white">${actScene}</label>
                        </div>
                    </div>
                `
            })
            appendToEl(getEl('filter-widget-actscenes'), actSceneHTML)
            forElsMatching('.filter-scene-checkbox', (el) => {
                el.onchange = (e) => {
                    if (e.target.checked) this.selectedScenes.add(e.target.dataset.scene)
                    else {
                        getEl('line-filter-all-scenes').checked = false
                        this.selectedScenes.delete(e.target.dataset.scene)
                    }

                    getEl('filter-apply-button').classList.remove('d-none')
                }
            })
        }
        getEl('filter-apply-button').classList.add('d-none')

        filterWidget.classList.remove('d-none')
    }
}