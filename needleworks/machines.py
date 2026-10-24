"""Embroidery machines and hoops. Add a machine here and the CLI and website pick it up.

Sizes are the sewable field in mm (width = left-right, height = front-back). `margin` is kept
clear inside the field. `format` is the file the machine reads from USB.
"""

MACHINES = {
    "brother-pe900": {
        "name": "Brother PE900",
        "format": "pes",
        "auto_trim": True,  # trims jump stitches itself
        "hoops": {
            "5x7": {"name": '5" x 7" (130 x 180 mm)', "w": 130.0, "h": 180.0},
        },
        "default_hoop": "5x7",
    },
}

DEFAULT_MACHINE = "brother-pe900"
MARGIN = 2.0


def hoop(machine=DEFAULT_MACHINE, hoop_id=None):
    m = MACHINES[machine]
    h = dict(m["hoops"][hoop_id or m["default_hoop"]])
    h["id"] = hoop_id or m["default_hoop"]
    h["machine"] = machine
    h["format"] = m["format"]
    return h


def catalog():
    """JSON-friendly list for the website's machine/hoop pickers."""
    return [{"id": k, "name": m["name"], "format": m["format"], "default_hoop": m["default_hoop"],
             "hoops": [{"id": hk, **hv} for hk, hv in m["hoops"].items()]} for k, m in MACHINES.items()]
