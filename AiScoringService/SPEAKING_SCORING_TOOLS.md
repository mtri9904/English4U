# Speaking scoring engine requirements

Speaking pronunciation scoring runs in strict mode by default. For ratable audio,
the service must have real pronunciation evidence instead of silently falling
back to ASR proxy scoring.

The default engine stack is:

- Praat/Parselmouth for pitch and intonation evidence.
- Montreal Forced Aligner for expected word/phone timing.
- Allosaurus for actual phone recognition.

## Environment

```env
SPEAKING_PRONUNCIATION_ENGINE=mfa_praat_allosaurus
SPEAKING_PRONUNCIATION_STRICT=true
SPEAKING_ENABLE_PRAAT=true
SPEAKING_ENABLE_MFA=true
SPEAKING_MFA_BINARY=mfa
SPEAKING_MFA_DICTIONARY_PATH=english_mfa
SPEAKING_MFA_ACOUSTIC_MODEL_PATH=english_mfa
SPEAKING_ENABLE_ALLOSAURUS=true
SPEAKING_ALLOSAURUS_MODEL=eng2102
SPEAKING_ALLOSAURUS_LANG=eng
SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS=90
SPEAKING_PITCH_FLOOR_HZ=75
SPEAKING_PITCH_CEILING_HZ=500
SPEAKING_PHONE_MATCH_THRESHOLD=0.45
```

Set `SPEAKING_PRONUNCIATION_STRICT=false` only for local debugging. Production
IELTS-style scoring should keep it true so missing engines stop scoring instead
of producing a proxy pronunciation band.

## Praat pitch evidence

Install the Python wrapper in the same Python environment that runs the service:

```powershell
pip install praat-parselmouth
```

When available, scoring evidence includes pitch mean, pitch range, and an
intonation variation score. The Pronunciation confidence can increase because
intonation is now audio-backed instead of inferred from ASR timing only.

## Montreal Forced Aligner

MFA requires the `mfa` CLI plus English dictionary/acoustic models. With the MFA
CLI installed, download the English model and dictionary:

```powershell
mfa model download acoustic english_mfa
mfa model download dictionary english_mfa
```

The service creates a temporary one-utterance corpus, runs MFA, parses TextGrid
word and phone tiers, and stores expected phone timing rows in phoneme analysis.

## Allosaurus actual phones

Allosaurus is installed with pip and the English-specific model is downloaded:

```powershell
pip install allosaurus
python -m allosaurus.bin.download_model -m eng2102
```

The service compares Allosaurus phone timestamps with the expected MFA phone
windows and uses the resulting phone match score as Pronunciation evidence.
