// Production builds inject package.json's version through the build wrapper so
// UI, feedback, package metadata, and save provenance cannot drift apart.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";
