"""
Launch an asset-family script in a separate headless Blender process.

Used from the Blender MCP (the connected GUI Blender runs this, which spawns
`blender --background` on the family script). Heavy bakes then cannot freeze or crash the
shared interactive session, and progress goes to test-output/blender-logs/<script>.log.

    import sys; sys.path.insert(0, r"<repo>/blender_scripts")
    import vw_launch; result = vw_launch.launch("asteroids.py")
"""
import os
import subprocess

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGS = os.path.join(ROOT, "test-output", "blender-logs")


def launch(script_name, *args):
    os.makedirs(LOGS, exist_ok=True)
    script = script_name if os.path.isabs(script_name) else os.path.join(HERE, script_name)
    log_path = os.path.join(LOGS, os.path.splitext(os.path.basename(script))[0] + ".log")
    log = open(log_path, "w")
    cmd = [bpy.app.binary_path, "-b", "--factory-startup", "-noaudio", "--python-exit-code", "1", "--python", script]
    if args:
        cmd += ["--", *args]
    proc = subprocess.Popen(
        cmd, stdout=log, stderr=subprocess.STDOUT, cwd=ROOT,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return {"pid": proc.pid, "log": log_path, "script": script}
