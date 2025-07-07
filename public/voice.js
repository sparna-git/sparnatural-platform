function startVoiceRecognition(callback) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Votre navigateur ne supporte pas la reconnaissance vocale.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("Texte reconnu :", transcript);
    callback(transcript);
  };

  recognition.start();
}
