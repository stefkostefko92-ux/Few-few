<?php
header('Content-Type: application/xml; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=3600');
readfile('/var/www/carbonstealth.eu/sitemap.xml');
