import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from pydantic import ValidationError

from backend.app.main import (
    LocationPayload,
    SisterTrajectoriesRequest,
    SourcePayload,
    sister_trajectories,
)


def locations(count=1):
    return [
        LocationPayload(
            name=f"Site {index + 1}",
            latitude=-30 + index,
            longitude=20 + index,
            altitude=1000,
        )
        for index in range(count)
    ]


def trajectory_points():
    start = datetime(2026, 6, 10, tzinfo=timezone.utc)
    times = [start + timedelta(hours=index) for index in range(13)]
    values = list(range(13))
    return times, values, values


class SisterTrajectoriesTests(unittest.TestCase):
    @patch("backend.app.main._trajectory_from_source")
    def test_builtin_source_uses_fixed_hourly_window(self, calculate):
        calculate.return_value = trajectory_points()
        request = SisterTrajectoriesRequest(
            source_name="3c48",
            locations=locations(),
            start_time=datetime(2026, 6, 10, tzinfo=timezone.utc),
        )

        response = sister_trajectories(request)

        self.assertEqual(response["duration_hours"], 12)
        self.assertEqual(response["step_minutes"], 60)
        self.assertEqual(len(response["datasets"][0]["points"]), 13)
        self.assertEqual(calculate.call_args.args[1:3], (13, 60))

    @patch("backend.app.main._trajectory_from_source")
    def test_catalog_source_is_accepted(self, calculate):
        calculate.return_value = trajectory_points()
        request = SisterTrajectoriesRequest(
            source=SourcePayload(
                name="Catalog target",
                ra="12:00:00",
                dec="-30:00:00",
                provider="simbad",
            ),
            locations=locations(),
        )

        response = sister_trajectories(request)

        self.assertEqual(response["source"]["provider"], "simbad")
        self.assertEqual(len(response["datasets"]), 1)

    def test_more_than_six_locations_is_rejected(self):
        with self.assertRaises(ValidationError):
            SisterTrajectoriesRequest(source_name="3c48", locations=locations(7))

    def test_invalid_coordinates_are_rejected(self):
        with self.assertRaises(ValidationError):
            LocationPayload(name="Invalid", latitude=91, longitude=0, altitude=0)

    @patch("backend.app.main._trajectory_from_source")
    def test_location_failures_do_not_discard_successes(self, calculate):
        calculate.side_effect = [trajectory_points(), ValueError("bad site")]
        request = SisterTrajectoriesRequest(
            source_name="3c48",
            locations=locations(2),
        )

        response = sister_trajectories(request)

        self.assertEqual(len(response["datasets"]), 1)
        self.assertEqual(len(response["errors"]), 1)
        self.assertEqual(response["errors"][0]["index"], 1)
        self.assertEqual(response["errors"][0]["detail"], "bad site")


if __name__ == "__main__":
    unittest.main()
