"""Experimental behavioral assumptions; not protocol rules."""


def forecast_limit(prior_volume, recent_volume, remaining_horizon, scale):
    """Five observed periods plus one prior observation, 50% safety discount."""
    rate = (prior_volume + recent_volume) / 6
    return max(0, int(scale * 0.5 * max(0, remaining_horizon) * rate))
