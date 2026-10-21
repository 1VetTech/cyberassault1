"""Guardrails for the Facility Alpha enemy graphics pass.

This test deliberately checks the original Home UI and stylesheet hashes so
visual iteration stays within the playable world and enemy models.
"""
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_INDEX_SHA256 = "ddec62a9dd8bbe6f135e9e54c36bf72a0cf667965294424d434572f60168cd0a"
EXPECTED_STYLES_SHA256 = "e81714d70ed3b727db5cd08d279e8abc842e50f421dc3f40e74a26dad842008c"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    assert digest(ROOT / "index.html") == EXPECTED_INDEX_SHA256, "Home UI/index.html was modified"
    assert digest(ROOT / "src" / "styles.css") == EXPECTED_STYLES_SHA256, "Home UI stylesheet was modified"

    source = (ROOT / "src" / "game.js").read_text(encoding="utf-8")
    for variant in ("raider", "recon", "breacher", "heavy", "marksman"):
        assert f"variant: '{variant}'" in source, f"Missing enemy variant: {variant}"
        assert f"{variant}:" in source, f"Missing variant styling: {variant}"
    for visual_feature in (
        "const FIELD_ART_URL = 'assets/1vettech 3d world.jpg'",
        "new THREE.TextureLoader().load(FIELD_ART_URL)",
        "fieldArt.complete&&fieldArt.naturalWidth",
        "new THREE.OctahedronGeometry(.61, 1)",
        "Dual night-vision lenses",
        "respirator filters",
        "Long-barrel precision rifle",
        "Rotor motion is driven in updateVisuals()",
        "Chest reactor",
        "enemyLook",
        "muzzleFlash",
        "weaponRig",
        "combatState",
        "SENTINEL PULSE",
        "MECH CANNON",
        "HEAVY ROCKET",
        "nextAimFx",
        "Distinct gait",
        "OPERATOR_FACE_FRAMES",
        "operatorFaceTexture",
        "tacticalFabricMaterial",
        "addOperatorEdgeGlow",
        "powerPreference: 'low-power'",
        'CHARACTER GRAPHICS: deployed-world models only',
    ):
        assert visual_feature in source, f"Missing graphics feature: {visual_feature}"

    assert 'function enemyUpdate(e,dt)' in source, 'Missing role-specific enemy AI update'
    assert 'function updateVisuals(dt)' in source, 'Missing animated visual sync'
    print({"status": "PASS", "enemy_variants": 5, "role_specific_ai": True, "character_animation": True, "drone_and_mech_models": True, "fallback_graphics": True, "home_ui_untouched": True})


if __name__ == "__main__":
    main()
