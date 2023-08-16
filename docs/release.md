# Release

To release a new version of Jazzer.js follow the described process:

1. Create a new release PR/branch
   - For minor and major release create a release PR
   - For patch releases create a new branch `vX.Y` (e.g. `v1.6`) based on
     `vX.Y.0` or simply check it out if it already exists
2. For patch releases, cherry-pick the relevant commits
3. Update the version numbers in `package.json` for the root and sub-modules.
   Version numbers are based on [Semantic Versioning](https://semver.org)
4. Add other release relevant changes, like adding release specific docs etc.
5. For minor and major releases, approve and merge the release PR
6. Create and push a version tag on the latest commit of the release
   - Tag format `v<new-version-number>`, e.g. `v1.0.0`
7. Wait until the `Prerelease` GitHub action workflow has finished successfully
   - The workflow creates a GitHub prerelease based on the created tag
   - It adds prebuild artifacts of all supported platforms
   - An automatic changelog, based on the included merge requests, is added to
     the prerelease description
   - The prerelease is listed on the
     [release page](https://github.com/CodeIntelligenceTesting/jazzer.js/releases)
8. Release the prerelease in GitHub
   - Adjust the prerelease description to include the highlights of the release
   - If you find some problems with the prerelease and want to start over:
     - Delete the tag (should be done first)
     - Remove the prerelease through the GitHub UI
     - Start this process anew
9. Wait until the `Release` GitHub action workflow has finished successfully
   - The workflow will build and publish the
     [NPM packages](https://www.npmjs.com/package/@jazzer.js/core).
10. Enjoy the rest of your day 🎂
