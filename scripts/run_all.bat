@ECHO off

SET command=%~1
IF "%command%" == "" (
  SET command="dryRun"
)

FOR /D %%G in ("*") DO (
  echo --- Executing example in %%G -----------------
  cd %%G
  IF EXIST "package.json" (
    npm install
    npm run "%command%" || cmd /c exit -1073741510
  )
  cd ..
)
