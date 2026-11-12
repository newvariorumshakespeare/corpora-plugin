import json
import math
import re
from elasticsearch_dsl import Search
from corpus.utilities import run_neo


# values for Reference.collation_status and Play.copy_text_status
STATUS_IMPORTING = 'Importing'  # stored as "Importing: <job id>"
STATUS_IMPORTED = 'Imported'
STATUS_LINEATED = 'Lineated'
STATUS_ERROR = 'Error'  # stored as "Error: <message>"


def bulk_delete_content(corpus, content_type, query, chunk_size=1000):
    """
    Deletes the content matching a query from Neo4j, Elasticsearch, and MongoDB, as calling
    delete(track_deletions=False) on each would, but in batches rather than three round trips
    per record. Deleting a witness's lines or a play's copy text one at a time took ~16s.
    Only suitable for content types without files, and where nothing needs to clean up
    references to the deleted content (which is what track_deletions would arrange).
    """
    contents = list(corpus.get_content(content_type, query).only('uri').as_pymongo())
    es_index = f"corpus-{corpus.id}-{content_type.lower()}"

    for start in range(0, len(contents), chunk_size):
        chunk = contents[start:start + chunk_size]
        run_neo(
            f'''
                MATCH (d:{content_type} {{ corpus_id: $corpus_id }})
                WHERE d.uri IN $uris
                DETACH DELETE d
            ''',
            {'corpus_id': str(corpus.id), 'uris': [content['uri'] for content in chunk if content.get('uri')]}
        )
        Search(index=es_index).query('ids', values=[str(content['_id']) for content in chunk]).delete()
        corpus._get_db()[f"corpus_{corpus.id}_{content_type}"].delete_many({'_id': {'$in': [content['_id'] for content in chunk]}})

    return len(contents)


def normalize_line_id(raw_id):
    """
    Turns the ID a transcriber gave a page region into a TLN and an optional segment letter.

    IDs arrive in many shapes: 100 (an int), 0.1 (a float), ".1", "1.1 ", "0.1-A", "13-b",
    "4.A", "5&6". These come back as ("tln_100", None), ("tln_0.1", None), ("tln_0.1", None),
    ("tln_1.1", None), ("tln_0.1", "a"), ("tln_13", "b"), ("tln_4", "a"), ("tln_5and6", None).
    Anything that doesn't start with a digit (e.g. "THE") isn't a TLN and comes back as (None, None).
    """
    if raw_id is None:
        return None, None

    if isinstance(raw_id, float) and raw_id.is_integer():
        raw_id = int(raw_id)

    line_id = str(raw_id).strip().lower().replace(' ', '').replace('&', 'and')
    if line_id.startswith('tln_'):
        line_id = line_id[4:]

    segment = None
    segment_match = re.match(r'^(.+?)[-.]([a-z])$', line_id)
    if segment_match:
        line_id, segment = segment_match.groups()

    if line_id.startswith('.'):
        line_id = f"0{line_id}"

    if not re.match(r'^\d[a-z0-9._]*$', line_id):
        return None, None

    return f"tln_{line_id}", segment


def make_region_image_url(image_file, ocr_file_path, x, y, width, height):
    """
    Builds a IIIF image URL for a region drawn in the Transcribe view.

    Region coordinates are in the coordinate space of the image as Transcribe displayed it, so
    this undoes what Transcribe did to the image before display: cropping to a fixed region,
    downscaling to 1000px wide when the OCR is Google Cloud Vision JSON, and rotating. The URL
    goes through Corpora's /image/uri/ route, which serves local page images and redirects to
    external IIIF servers alike.
    """
    if not image_file or 'uri' not in image_file:
        return None

    iiif_info = image_file.get('iiif_info') or {}
    rotation = 0

    # local images are displayed at full size with no crop or rotation
    if not iiif_info:
        full_width = image_file.get('width')
        full_height = image_file.get('height')
        crop_x, crop_y = 0, 0
        crop_width, crop_height = full_width, full_height
        scale = 1

    # external IIIF images get Transcribe's fixed region, downscaling, and rotation
    else:
        full_width = iiif_info.get('width')
        full_height = iiif_info.get('height')
        crop_x, crop_y = 0, 0
        crop_width, crop_height = full_width, full_height
        if 'fixed_region' in iiif_info:
            fixed_region = iiif_info['fixed_region']
            crop_x, crop_y = fixed_region['x'], fixed_region['y']
            crop_width, crop_height = fixed_region['w'], fixed_region['h']

        scale = 1
        if full_width and full_width > 1000 and ocr_file_path and ocr_file_path.lower().endswith('.json'):
            scale = 1000 / crop_width

        rotation = iiif_info.get('fixed_rotation', 0) or 0

    # regions can be drawn right-to-left or bottom-to-top
    if width < 0:
        x, width = x + width, -width
    if height < 0:
        y, height = y + height, -height

    corners = [(x, y), (x + width, y), (x, y + height), (x + width, y + height)]

    # undo rotation: IIIF rotates clockwise around the center and grows the canvas to fit
    if rotation % 360 and crop_width and crop_height:
        theta = math.radians(rotation)
        cos, sin = math.cos(theta), math.sin(theta)
        displayed_width, displayed_height = crop_width * scale, crop_height * scale
        rotated_width = displayed_width * abs(cos) + displayed_height * abs(sin)
        rotated_height = displayed_width * abs(sin) + displayed_height * abs(cos)

        unrotated = []
        for corner_x, corner_y in corners:
            dx, dy = corner_x - rotated_width / 2, corner_y - rotated_height / 2
            unrotated.append((
                dx * cos + dy * sin + displayed_width / 2,
                -dx * sin + dy * cos + displayed_height / 2
            ))
        corners = unrotated

    left = min(c[0] for c in corners) / scale + crop_x
    top = min(c[1] for c in corners) / scale + crop_y
    right = max(c[0] for c in corners) / scale + crop_x
    bottom = max(c[1] for c in corners) / scale + crop_y

    # keep the region on the image
    left, top = max(left, crop_x), max(top, crop_y)
    if crop_width and crop_height:
        right = min(right, crop_x + crop_width)
        bottom = min(bottom, crop_y + crop_height)

    region_width, region_height = round(right - left), round(bottom - top)
    if region_width <= 0 or region_height <= 0:
        return None

    image_uri = image_file['uri'].replace('/', '|')
    return f"/image/uri/{image_uri}/{round(left)},{round(top)},{region_width},{region_height}/max/{rotation}/default.png"


def get_transcription_regions(corpus, trans_project, job=None):
    """
    Yields every region of a transcription project in reading order (page order, then the region
    order saved by Transcribe), along with the page it's on and the IIIF URL for its image.
    """
    document = trans_project.document

    pageset = None
    if trans_project.pageset != 'all' and trans_project.pageset in document.page_sets:
        pageset = trans_project.pageset

    image_pfc = document.get_page_file_collection(trans_project.image_pfc, pageset) if trans_project.image_pfc else {}
    ocr_pfc = document.get_page_file_collection(trans_project.ocr_pfc, pageset) if trans_project.ocr_pfc else {}
    image_files = image_pfc.get('page_files', {})
    ocr_files = ocr_pfc.get('page_files', {})

    transcriptions = {
        t.page_refno: t for t in corpus.get_content('Transcription', {'project': trans_project.id})
    }

    ref_nos = document.ordered_pages(pageset).ordered_ref_nos
    for page_index, ref_no in enumerate(ref_nos):
        transcription = transcriptions.get(ref_no)
        regions = []
        if transcription and transcription.data:
            try:
                regions = json.loads(transcription.data)
            except ValueError:
                regions = None

        image_file = image_files.get(ref_no)
        ocr_file_path = ocr_files.get(ref_no, {}).get('path')

        yield {
            'ref_no': ref_no,
            'transcription': transcription,
            'regions': [
                dict(region, image=make_region_image_url(
                    image_file,
                    ocr_file_path,
                    region.get('x', 0),
                    region.get('y', 0),
                    region.get('width', 0),
                    region.get('height', 0)
                ))
                for region in (regions or [])
            ],
            'unparseable': regions is None,
        }

        if job and len(ref_nos):
            job.set_status('running', percent_complete=int(((page_index + 1) / len(ref_nos)) * 90))


def assemble_witness_lines(corpus, trans_project, job=None):
    """
    Turns the regions of a transcription project into the lines of a witness, in reading order.

    Regions whose IDs carry a segment letter (13-a, 13-b) belong to the same line, so they're
    combined with the first line that has their TLN, wherever it falls, with the pieces put in
    segment order (an unlettered piece counts as the start of the line). That handles turnovers,
    which Transcribe often orders well away from the line they complete. Regions sharing a TLN
    where neither carries a segment letter stay separate lines, since that's more likely a typo,
    but only the first keeps the TLN: a witness never has two lines with the same TLN, so the later
    one gets none (leaving it to be aligned in the Lineator). Both lines are marked with the
    duplicated TLN in 'duplicate_tln', so reports can point transcribers at either region.

    Returns the lines (each with the regions it came from) along with the pages and regions
    that couldn't be used.
    """
    assembled = {
        'lines': [],
        'empty_regions': [],
        'untranscribed_pages': [],
        'incomplete_pages': [],
        'unparseable_pages': [],
    }
    first_line_by_tln = {}

    for page in get_transcription_regions(corpus, trans_project, job):
        if not page['transcription']:
            assembled['untranscribed_pages'].append(page['ref_no'])
            continue
        if not page['transcription'].complete:
            assembled['incomplete_pages'].append(page['ref_no'])
        if page['unparseable']:
            assembled['unparseable_pages'].append(page['ref_no'])
            continue

        for region in page['regions']:
            raw_id = (region.get('metadata') or {}).get('ID')
            tln, segment = normalize_line_id(raw_id)

            # prefer the human-verified transcription, falling back on raw OCR
            text = (region.get('transcription') or '').strip()
            has_transcription = bool(text)
            if not text:
                text = (region.get('ocr_content') or '').strip()

            region_info = {
                'ref_no': page['ref_no'],
                'raw_id': raw_id,
                'tln': tln,
                'segment': segment,
                'text': text,
                'has_transcription': has_transcription,
                'image': region['image'],
            }

            if not text:
                assembled['empty_regions'].append(region_info)
                continue

            existing_line = first_line_by_tln.get(tln)
            if existing_line and (segment or any(r['segment'] for r in existing_line['regions'])):
                existing_line['regions'].append(region_info)
                existing_line['regions'].sort(key=lambda r: r['segment'] or '')
                existing_line['text'] = ' '.join(r['text'] for r in existing_line['regions'])
                existing_line['images'] = [r['image'] for r in existing_line['regions'] if r['image']]
                continue

            line = {
                'tln': tln,
                'text': text,
                'images': [region['image']] if region['image'] else [],
                'regions': [region_info],
            }
            if existing_line:
                existing_line['duplicate_tln'] = tln
                line['duplicate_tln'] = tln
                line['tln'] = None
            assembled['lines'].append(line)
            if tln and tln not in first_line_by_tln:
                first_line_by_tln[tln] = line

    return assembled
