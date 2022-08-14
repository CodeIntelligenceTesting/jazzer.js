@ECHO off

FOR /D %%G in ("*") DO (
  cd %%G
  npm install
  npm run dryRun
  cd ..
)
