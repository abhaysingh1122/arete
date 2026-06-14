' Silent launcher for the Tasks Widget (no console window)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "d:\antigravity_projects\tasks-widget"
sh.Run "cmd /c set ""ELECTRON_RUN_AS_NODE="" && npm start", 0, False
