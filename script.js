// ---------------- Mapping ----------------
const map = {
  "अ":"v","आ":"vk","इ":"b","ई":"bZ","उ":"m","ऊ":"Å",
  "क":"d","ख":"[k","ग":"x","घ":"?k","च":"p","छ":"N",
  "ज":"t","ट":"V","ठ":"B","ड":"M","त":"r","द":"n",
  "न":"u","प":"i","फ":"Q","ब":"c","भ":"Hk","म":"e",
  "य":";","र":"j","ल":"y","व":"o","स":"l","ह":"g",
  "ा":"k","ि":"f","ी":"h","ु":"q","ू":"w","े":"s","ो":"ks"
};


const reverseMap = {};
for (let k in map) reverseMap[map[k]] = k;


// -------------- Detection --------------
function detect(text) {
  return /[क-ह]/.test(text) ? "uniToKruti" : "krutiToUni";
}


// -------------- Convert --------------
function toKruti(text) {
  return text.replace(/([क-ह])ि/g, (m,p)=>"f"+map[p])
             .split("")
             .map(c=>map[c]||c)
             .join("");
}


function toUnicode(text) {
  let result = text;
  let keys = Object.keys(reverseMap).sort((a,b)=>b.length-a.length);
  keys.forEach(k=>{
    result = result.replace(new RegExp(k,"g"), reverseMap[k]);
  });
  return result;
}


// -------------- Main Live Engine --------------
document.getElementById("inputText").addEventListener("input", () => {
  let input = document.getElementById("inputText").value;
  let mode = document.getElementById("mode").value;


  if (mode === "auto") mode = detect(input);


  let output = mode === "uniToKruti" ? toKruti(input) : toUnicode(input);


  document.getElementById("outputText").value = output;


  // Stats
  document.getElementById("charCount").innerText = input.length;
  document.getElementById("wordCount").innerText = input.trim() ? input.trim().split(/\s+/).length : 0;
});


// -------------- UI Actions --------------
function toggleMode() {
  let m = document.getElementById("mode");
  m.value = m.value === "uniToKruti" ? "krutiToUni" : "uniToKruti";
}


function copyText() {
  let t = document.getElementById("outputText");
  t.select();
  document.execCommand("copy");
  alert("Copied!");
}


function clearText() {
  inputText.value = "";
  outputText.value = "";
}


function downloadText() {
  let blob = new Blob([outputText.value], {type:"text/plain"});
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "converted.txt";
  a.click();
}