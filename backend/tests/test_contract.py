from pathlib import Path

import yaml
from openapi_spec_validator import validate_spec

from app.main import app

HTTP_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
}


def load_contract() -> dict[str, object]:
    contract_path = Path(__file__).resolve().parents[2] / "contracts" / "openapi.yaml"

    with contract_path.open(encoding="utf-8") as file:
        contract = yaml.safe_load(file)

    assert isinstance(contract, dict)

    return contract


def get_contract_operations(
    contract: dict[str, object],
) -> set[tuple[str, str]]:
    raw_paths = contract.get("paths")

    assert isinstance(raw_paths, dict)

    operations: set[tuple[str, str]] = set()

    for path, raw_path_item in raw_paths.items():
        assert isinstance(path, str)
        assert isinstance(raw_path_item, dict)

        for method in raw_path_item:
            if method in HTTP_METHODS:
                operations.add(
                    (
                        path,
                        method,
                    )
                )

    return operations


def get_backend_operations() -> set[tuple[str, str]]:
    generated = app.openapi()

    raw_paths = generated.get("paths")

    assert isinstance(raw_paths, dict)

    operations: set[tuple[str, str]] = set()

    prefix = "/api/v1"

    for path, raw_path_item in raw_paths.items():
        if not path.startswith(prefix):
            continue

        contract_path = path[len(prefix) :]

        if not contract_path:
            contract_path = "/"

        assert isinstance(raw_path_item, dict)

        for method in raw_path_item:
            if method in HTTP_METHODS:
                operations.add(
                    (
                        contract_path,
                        method,
                    )
                )

    return operations


def test_openapi_contract_is_valid() -> None:
    contract = load_contract()

    validate_spec(contract)


def test_backend_implements_all_contract_operations() -> None:
    contract = load_contract()

    expected = get_contract_operations(contract)

    actual = get_backend_operations()

    missing = expected - actual

    assert not missing, f"Backend is missing OpenAPI operations: {sorted(missing)}"


def test_backend_has_no_undocumented_api_operations() -> None:
    contract = load_contract()

    expected = get_contract_operations(contract)

    actual = get_backend_operations()

    undocumented = actual - expected

    assert not undocumented, (
        f"Backend exposes undocumented operations: {sorted(undocumented)}"
    )
