try {
  require("firebase-admin/auth");
  require("firebase-admin/firestore");
  console.log("PASS Firebase Admin auth and Firestore load in the Node.js runtime");
} catch (error) {
  console.error("FAIL Firebase Admin modules could not load:", error);
  process.exitCode = 1;
}
