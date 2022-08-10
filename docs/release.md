# Release

To release a new version of Jazzer.js follow the described process:

1. Create a release PR
   - Update the version numbers in `package.json` for the root and sub-modules  
     Version numbers are based on [Semantic Versioning](https://semver.org)
   - Add other release relevant changes, like adding release specific docs etc
2. Approve and merge the release PR
3. Create and push a version tag on the latest commit of the release
   - Tag format `v<new-version-number>`, e.g. `v1.0.0`
4. Wait until the `Prerelease` GitHub action workflow has finished successfully
   - The workflow will create a GitHub pre-release based on the tag
   - It adds prebuild artifacts of all supported platforms to it
   - An automatic changelog based on the included merge requests added to the
     prerelease description
   - The prerelease is listed on the
     [release page](https://github.com/CodeIntelligenceTesting/jazzer.js/releases)
5. Release the prerelease in GitHub
   - Adjust the prerelease description to include the highlights of the release
   - If you find some problems with the prerelease and want to start over:
     - Delete the tag (should be done first)
     - Remove the prerelease through the GitHub UI
     - Start this process anew
6. Wait until the `Release` GitHub action workflow has finished successfully
   - The workflow will build and publish the
     [NPM packages](https://www.npmjs.com/package/@jazzer.js/core).
7. Enjoy the rest of your day
