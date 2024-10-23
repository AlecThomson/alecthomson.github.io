#!/usr/bin/env python3

import requests
from urllib.parse import urlencode
import json
import os

token = os.environ['ADS_TOKEN']

def main():
    encoded_query = urlencode(
        {"q": "orcid:0000-0001-9472-041X", "fl": "bibcode", "rows": 2000}
    )


    results = requests.get(
        "https://api.adsabs.harvard.edu/v1/search/query?{}".format(encoded_query),
        headers={"Authorization": "Bearer " + token},
    )

    # format the response in a nicely readable format
    bibcodes = [x["bibcode"] for x in results.json()["response"]["docs"]]

    # create a dictionary with the payload values
    payload = {"bibcode": bibcodes}

    # the json library offers an easy way to convert between JSON or dictionaries and their serialized strings

    serialized_payload = json.dumps(payload)

    results = requests.post(
        "https://api.adsabs.harvard.edu/v1/export/bibtex",
        headers={"Authorization": "Bearer " + token},
        data=serialized_payload,
    )
    with open("publications.bib", "w") as f:
        f.write(results.json()["export"])

if __name__ == '__main__':
    main()