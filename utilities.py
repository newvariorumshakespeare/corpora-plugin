import json
from manager.utilities import _contains


def make_collation_lines_from_transcription_project(corpus, play, transcription_project_id):
    # grab the transcription project
    trans_project = corpus.get_content('TranscriptionProject', transcription_project_id, single_result=True)
    if trans_project:
        pageset = None
        image_pfc = None
        line_ids = set()

        if trans_project.pageset != 'all' and trans_project.pageset in trans_project.document.page_sets:
            pageset = trans_project.pageset

        if trans_project.image_pfc:
            image_pfc = trans_project.document.get_page_file_collection(trans_project.image_pfc, pageset)

        # grab page-level transcriptions
        page_transcriptions = corpus.get_content('Transcription', {'project': trans_project.id}).order_by('+page_refno')
        for page_transcription in page_transcriptions:
            if page_transcription.data:
                page_image = None
                page_lines = None

                # get page image
                if image_pfc and page_transcription.page_refno in image_pfc['page_files']:
                    page_image = image_pfc['page_files'][page_transcription.page_refno]['path']

                # parse line-level transcriptions from page transcription data
                try:
                    page_lines = json.loads(page_transcription.data)
                except:
                    print(f"Unable to parse JSON for page {page_transcription.page_refno} of the {trans_project.name} transcription project.")

                if page_lines:
                    line_info = {}

                    for page_line in page_lines:
                        if 'metadata' in page_line and 'ID' in page_line['metadata'] and page_line['metadata']['ID']:
                            if page_line['metadata']['ID']:
                                line_id = f"{page_line['metadata']['ID']}".strip().lower().replace(' ', '_')
                                if line_id.startswith('.'):
                                    line_id = f"0{line_id}"

                                tln = f"tln_{line_id}"

                                if tln not in line_ids:

                                    if '.' in tln and not tln[-1].isdigit():
                                        if 'alt_tlns' not in line_info:
                                            line_info['alt_tlns'] = []

                                        line_info['alt_tlns'].append(tln)
                                        line_segments = tln.split('.')
                                        tln = line_segments[0]

                                        if 'tln' in line_info and tln != line_info['tln']:
                                            make_collation_line(
                                                corpus,
                                                trans_project.document,
                                                line_info,
                                                line_ids,
                                                play
                                            )
                                            line_info.clear()

                                        if 'tln' not in line_info:
                                            line_info['tln'] = tln
                                            line_info['text'] = page_line['transcription'].strip()
                                            line_info['image'] = page_image

                                            if 'x' in page_line and 'y' in page_line and page_line['x'] and page_line['y']:
                                                line_info['x'] = round(page_line['x'])
                                                line_info['y'] = round(page_line['y'])

                                            if 'width' in page_line and 'height' in page_line and page_line['width'] and page_line['height']:
                                                line_info['width'] = round(page_line['width'])
                                                line_info['height'] = round(page_line['height'])

                                        elif line_info['tln'] == tln:
                                            line_info['text'] += f" {page_line['transcription'].strip()}"


                                            if page_line['x'] < line_info['x']:
                                                line_info['x'] = page_line['x']
                                            if page_line['y'] < line_info['y']:
                                                line_info['y'] = page_line['y']
                                            if page_line['width'] > line_info['width']:
                                                line_info['width'] = page_line['width']
                                            if page_line['height'] > line_info['height']:
                                                line_info['height'] = page_line['height']

                                    else:
                                        if line_info:
                                            make_collation_line(
                                                corpus,
                                                trans_project.document,
                                                line_info,
                                                line_ids,
                                                play
                                            )
                                            line_info.clear()

                                        line_info['tln'] = tln
                                        line_info['text'] = page_line['transcription'].strip()
                                        line_info['image'] = page_image
                                        line_info['x'] = page_line['x']
                                        line_info['y'] = page_line['y']
                                        line_info['width'] = round(page_line['width'])
                                        line_info['height'] = round(page_line['height'])

                    if line_info:
                        make_collation_line(
                            corpus,
                            trans_project.document,
                            line_info,
                            line_ids,
                            play
                        )


def make_collation_line(corpus, document, line_info, line_ids, play):
    line = corpus.get_content('CollationLine', {
        'play': play.id,
        'witness': document.id,
        'tln': line_info['tln'],
    }, single_result=True)

    if not line:
        line = corpus.get_content('CollationLine')
        line.tln = line_info['tln']
        line.witness = document.id
        line.play = play.id

    line.text = line_info['text']
    line.alt_tlns = line_info.get('alt_tlns', None)
    line.image = line_info['image']
    line.x_coordinate = line_info.get('x', None)
    line.y_coordinate = line_info.get('y', None)
    line.width = line_info.get('width', None)
    line.height = line_info.get('height', None)

    line_ids.add(line_info['tln'])
    line.order = len(line_ids)

    line.save()
