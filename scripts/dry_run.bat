@ECHO off

FOR /D %%G in ("*") DO (
  echo --- Executing example in %%G -----------------
  cd %%G
  IF EXIST "package.json" (
    npm install
    npm run dryRun
  )
  cd ..
)
