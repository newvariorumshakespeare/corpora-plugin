import json
import re

from manager.utilities import _contains


def make_collation_lines_from_transcription_project(job):
    # derive corpus, play, and transcription_project_id from job values
    corpus = job.corpus
    play = job.content
    transcription_project_id = job.get_param_value('transcription_project_id')

    # grab the transcription project
    trans_project = corpus.get_content('TranscriptionProject', transcription_project_id)
    if trans_project:

        # retrieve witness (Reference) so we can report completion
        doc = trans_project.document
        witness = corpus.get_content('Reference', {'play': play.id, 'document': doc.id}, single_result=True)

        if witness:
            job.set_status('running')

            pageset = None
            image_pfc = None
            line_ids = set()
            line_segments = []
            line_info = {}

            if trans_project.pageset != 'all' and trans_project.pageset in trans_project.document.page_sets:
                pageset = trans_project.pageset

            if trans_project.image_pfc:
                image_pfc = trans_project.document.get_page_file_collection(trans_project.image_pfc, pageset)

            # grab page-level transcriptions
            page_transcriptions = corpus.get_content('Transcription', {'project': trans_project.id})
            page_count = page_transcriptions.count()
            pages_processed = 0

            for page_transcription in page_transcriptions:
                if page_transcription.data:
                    page_file = None
                    page_image = None
                    page_lines = None
                    perform_upscale = False
                    original_image_width = None

                    # get page image
                    if image_pfc and page_transcription.page_refno in image_pfc['page_files']:
                        page_file = image_pfc['page_files'][page_transcription.page_refno]
                        page_image = page_file['path']

                        # determine whether the image was downscaled during transcription, requiring us to upscale any image regions for this page
                        if 'iiif_info' in page_file and 'width' in page_file['iiif_info'] and page_file['iiif_info']['width'] > 1000 and trans_project.ocr_pfc and 'json' in trans_project.ocr_pfc:
                            perform_upscale = True
                            original_image_width = page_file['iiif_info']['width']

                    # parse line-level transcriptions from page transcription data
                    try:
                        page_lines = json.loads(page_transcription.data)
                    except:
                        print(f"Unable to parse JSON for page {page_transcription.page_refno} of the {trans_project.name} transcription project.")

                    if page_lines:

                        for page_line in page_lines:
                            if 'metadata' in page_line and 'ID' in page_line['metadata'] and page_line['metadata']['ID'] and 'transcription' in page_line:

                                # grab the value of the ID field for the transcription line and clean it
                                line_id = f"{page_line['metadata']['ID']}".strip().lower().replace(' ', '_').replace('tln_', '')

                                # determine the TLN portion of the ID and determine whether part of a line segment
                                tln, segment = determine_lineation(line_id)

                                # only proceed if we have a TLN
                                if tln:
                                    # prepend a 0 if TLN starts with a dot
                                    if tln.startswith('.'):
                                        tln = f"0{tln}"

                                    # prepend tln_
                                    tln = f"tln_{tln}"

                                    # make sure we haven't processed this TLN yet
                                    if tln not in line_ids:

                                        # ensure we have necessary image region info and upscale/round if necessary
                                        if _contains(page_line, ['x', 'y', 'width', 'height']):
                                            if perform_upscale:
                                                scale_page_line_image(page_line, 1000, original_image_width)
                                            else:
                                                page_line['x'] = round(page_line['x'])
                                                page_line['y'] = round(page_line['y'])
                                                page_line['width'] = round(page_line['width'])
                                                page_line['height'] = round(page_line['height'])

                                            # CASE: this is a line segment
                                            if segment:

                                                # edge case where we're dealing with the start of a new segmented line
                                                if 'tln' in line_info and tln != line_info['tln']:
                                                    make_collation_line(
                                                        corpus,
                                                        trans_project.document,
                                                        line_info,
                                                        line_ids,
                                                        play
                                                    )
                                                    line_info.clear()

                                                # keep track of this segment's full tln
                                                if 'alt_tlns' not in line_info:
                                                    line_info['alt_tlns'] = []
                                                line_info['alt_tlns'].append(f"{tln}-{segment}")

                                                # CASE: a new segmented line...
                                                if 'tln' not in line_info:
                                                    line_info['tln'] = tln
                                                    line_info['text'] = page_line['transcription'].strip()
                                                    line_info['image'] = page_image

                                                    if 'x' in page_line and 'y' in page_line and page_line['x'] and page_line['y']:
                                                        line_info['x'] = page_line['x']
                                                        line_info['y'] = page_line['y']

                                                    if 'width' in page_line and 'height' in page_line and page_line['width'] and page_line['height']:
                                                        line_info['width'] = page_line['width']
                                                        line_info['height'] = page_line['height']

                                                # CASE: a subsequent segment for a line we're building
                                                elif line_info['tln'] == tln:
                                                    # append this segment's transcription
                                                    line_info['text'] += f" {page_line['transcription'].strip()}"

                                                    # make sure this segment's image is on the same page
                                                    if line_info['image'] == page_image:

                                                        # calculate current furthermost x and y
                                                        ending_x = line_info['x'] + line_info['width']
                                                        ending_y = line_info['y'] + line_info['height']

                                                        # calculate new image segment's furthermost x and y
                                                        new_ending_x = page_line['x'] + page_line['width']
                                                        new_ending_y = page_line['y'] + page_line['height']

                                                        # make sure we've established the left and topmost x and y of the two
                                                        if page_line['x'] < line_info['x']:
                                                            line_info['x'] = page_line['x']
                                                        if page_line['y'] < line_info['y']:
                                                            line_info['y'] = page_line['y']

                                                        # make sure we set width and height according to the furthermost x and y of the two
                                                        if new_ending_x > ending_x:
                                                            line_info['width'] = new_ending_x - line_info['x']
                                                        if new_ending_y > ending_y:
                                                            line_info['height'] = new_ending_y - line_info['y']

                                                    # if this segment's image isn't on same page, mark as partial image
                                                    else:
                                                        line_info['partial_image'] = True

                                            # CASE: this is a full line
                                            else:
                                                # if the line_info dict is populated, go ahead and save the previous line
                                                if line_info:
                                                    make_collation_line(
                                                        corpus,
                                                        trans_project.document,
                                                        line_info,
                                                        line_ids,
                                                        play
                                                    )
                                                    line_info.clear()

                                                # populate the line_info dict so we can eventually save it
                                                line_info['tln'] = tln
                                                line_info['text'] = page_line['transcription'].strip()
                                                line_info['image'] = page_image
                                                line_info['x'] = page_line['x']
                                                line_info['y'] = page_line['y']
                                                line_info['width'] = page_line['width']
                                                line_info['height'] = page_line['height']

                        if line_info:
                            make_collation_line(
                                corpus,
                                trans_project.document,
                                line_info,
                                line_ids,
                                play
                            )

                pages_processed += 1
                percent_complete = int( (pages_processed / page_count) * 100)
                job.set_status('running', percent_complete=percent_complete)

            witness.collation_status = 'Imported'
            witness.save()
        else:
            # error where witness not found
            pass

    else:
        # error where transcription project not found
        pass


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

    if 'partial_image' in line_info:
        line.partial_image = line_info['partial_image']

    line_ids.add(line_info['tln'])
    line.order = len(line_ids)

    line.save()


def determine_lineation(identifier):
    tln = None
    segment = None

    tln_regex = r'([^-]*)'
    segment_regex = r'-([a-z])$'

    tln_match = re.search(tln_regex, identifier)
    if tln_match:
        tln = tln_match.group(1)

    if tln:
        segment_match = re.search(segment_regex, identifier)
        if segment_match:
            segment = segment_match.group(1)

    return tln, segment


def scale_page_line_image(page_line, downscaled_width, actual_width):
    factor = actual_width / downscaled_width

    page_line['x'] = round(page_line['x'] * factor)
    page_line['y'] = round(page_line['y'] * factor)
    page_line['width'] = round(page_line['width'] * factor)
    page_line['height'] = round(page_line['height'] * factor)
