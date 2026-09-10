# pragma version 0.4.2
# Local fork only: deterministic weight and an observable execution target.
marker: public(uint256)

@external
@pure
def weight(_account: address) -> uint256:
    return 10**24

@external
def record(_value: uint256):
    self.marker = _value
