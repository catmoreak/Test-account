require("dotenv").config();
const { translateWithSarvam } = require("./src/services/sarvamClient");

async function run() {
  const result = await translateWithSarvam("Your balance is 500 rupees.", "kn");
  console.log(result);
}
run();
