import os, sys

# load .env
with open(r"C:\Users\HP\Downloads\EventOS\backend\.env") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ[k.strip()] = v.strip()

import google.generativeai as genai
genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

print("Models available on your key:\n")
for m in genai.list_models():
    if "generateContent" in m.supported_generation_methods:
        print(f"  {m.name}")