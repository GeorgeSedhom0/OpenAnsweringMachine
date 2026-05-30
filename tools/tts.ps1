param(
  [Parameter(Mandatory=$true)][string]$TextFile,
  [Parameter(Mandatory=$true)][string]$OutFile
)
# Synthesize a greeting with the built-in Windows voice into a 16 kHz mono 16-bit WAV
# (the exact format the BTstack greeting loader expects).
Add-Type -AssemblyName System.Speech
$text  = Get-Content -Raw -Encoding UTF8 $TextFile
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt   = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, `
           [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, `
           [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($OutFile, $fmt)
$synth.Speak($text)
$synth.Dispose()
Write-Output "ok"
