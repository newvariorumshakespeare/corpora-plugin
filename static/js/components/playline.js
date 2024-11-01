(function() {
    let h = maquette.h

    window.createPlayLine = function(tln, content, witness_meter) {
        let witness_meter_url = `https://newvariorumshakespeare.org/witnessmeter/${witness_meter}/25/177/FFFFFF/0/`
        let has_variants = parseInt(witness_meter) > 0

        let loadVariants = function() {
            if (has_variants) {
                console.log('variants loading')
            }
        }

        let playLine = {
            render: function() {
                return h('div.playline', {key: `playline_${tln}`}, [
                    h('div.playline_witness_meter_container', [
                        h('img.playline_witness_meter', {src: witness_meter_url})
                    ]),
                    h('div.playline_disclosure',
                        {
                            key: `playline_disclosure_${tln}`,
                            onclick: loadVariants
                        }, []),
                    h('div.playline_content', [ content ]),
                    h('div.playline_tln', [ tln ])
                ])
            }
        }

        return playLine
    }
}())