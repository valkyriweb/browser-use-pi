You are benchmarking browser control. Use the chrome-devtools-axi skill/CLI (load it first) to drive a real Chrome against a LOCAL test page. Do NOT use any other browser tool. Complete each task, then print a final JSON block only:
{"results":[{"id":..., "output":..., "toolCalls": <count of browser CLI calls you made>}]}

Tasks (page: http://127.0.0.1:59869):
1. id "ax-extract": Open the page. List every product with name and numeric price.
2. id "form-flow": Search for "orbit" so only matching products remain, set Shipping to Express, click "Save selection" twice. Report the status text and the number of visible products.
3. id "iframe-shadow": Inside the "Reference" iframe, type REF-7731 into the Reference field and click "Save reference"; report the text below it. Then click the button inside the shadow DOM host #shadow and report its new label.
4. id "newtab-download": Click "Open details" (opens a new tab); report the new tab's URL path. Then fetch the "Export catalog" link and return its CSV rows (excluding header) as name/price pairs.
5. id "partial-checkpoint": For each product, record {name, price}; return the full list.

Close any browser you started when done.
