from django.urls import path
from . import views as nvs_views


urlpatterns = [
    path('corpus/<str:corpus_id>/home/', nvs_views.home),
    path('corpus/<str:corpus_id>/about/', nvs_views.info_about),
    path('corpus/<str:corpus_id>/contributors/', nvs_views.info_contributors),
    path('corpus/<str:corpus_id>/print/', nvs_views.info_print_editions),
    path('corpus/<str:corpus_id>/news/', nvs_views.info_news),
    path('corpus/<str:corpus_id>/how-to/', nvs_views.info_how_to),
    path('corpus/<str:corpus_id>/faqs/', nvs_views.info_faqs),
    path('corpus/<str:corpus_id>/tools/', nvs_views.tools_about),
    path('corpus/<str:corpus_id>/play-viewer/<str:play_prefix>/', nvs_views.playviewer),
    path('corpus/<str:corpus_id>/play-minimap/<str:play_prefix>/', nvs_views.play_minimap),
    path('corpus/<str:corpus_id>/paratext-viewer/<str:play_prefix>/<str:section>/', nvs_views.paratext),
    path('nvs/witness-meter/<str:witness_flags>/<str:height>/<str:width>/<str:inactive_color_hex>/<str:label_buffer>/', nvs_views.witness_meter),

    path('api/corpus/<str:corpus_id>/nvs-search/<str:play_prefix>/', nvs_views.api_search),
    path('api/corpus/<str:corpus_id>/nvs-lines/<str:play_prefix>/', nvs_views.api_lines),
    path('api/corpus/<str:corpus_id>/nvs-lines/<str:play_prefix>/<str:starting_line_id>/', nvs_views.api_lines),
    path('api/corpus/<str:corpus_id>/nvs-lines/<str:play_prefix>/<str:starting_line_id>/<str:ending_line_id>/', nvs_views.api_lines),
    path('api/corpus/<str:corpus_id>/nvs-edition-lines/<str:play_prefix>/<str:siglum>/', nvs_views.api_edition_lines),
    path('api/corpus/<str:corpus_id>/nvs-witnesses/<str:play_prefix>/', nvs_views.api_witnesses),

    path('corpus/<str:corpus_id>/collation-wizard/<str:play_prefix>/', nvs_views.collation_wizard),
    path('api/corpus/<str:corpus_id>/collation-wizard/<str:play_prefix>/status/', nvs_views.api_collation_wizard_status),
    path('corpus/<str:corpus_id>/lineator/<str:play_prefix>/', nvs_views.lineator),
    path('api/corpus/<str:corpus_id>/lineator/<str:play_prefix>/lines/<str:witness_id>/', nvs_views.api_lineator_lines),
    path('api/corpus/<str:corpus_id>/lineator/<str:play_prefix>/pages/<str:witness_id>/', nvs_views.api_witness_pages),
    path('api/corpus/<str:corpus_id>/lineator/<str:play_prefix>/update/', nvs_views.api_lineator_update),
    path('corpus/<str:corpus_id>/collator/<str:play_prefix>/', nvs_views.collator),
    path('api/corpus/<str:corpus_id>/diff/<str:play_prefix>/', nvs_views.api_diff),
    path('api/corpus/<str:corpus_id>/play/<str:play_prefix>/witness/<str:siglum>/collation-status/', nvs_views.api_witness_collation_status),
]
