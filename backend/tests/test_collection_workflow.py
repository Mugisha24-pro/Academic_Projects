"""Isolated workflow tests; never connect to the configured application database."""
import os
import unittest
from datetime import date
from unittest.mock import patch
from pydantic import ValidationError

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['SECRET_KEY'] = 'test-only-secret'

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Bin, BinStatus, PickupRequest, PickupStatus, Route, User, UserRole
from app.routers.routes import create_route, collect_stop, approve_route, update_route
from app.routers.bins import update_bin
from app.routers.pickup_requests import create_pickup_request, update_pickup_request, complete_pickup_request, approve_pickup_request
from app.schemas import BinUpdate, PickupRequestCreate, PickupRequestUpdate, RouteCreate, RouteUpdate


class CollectionWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.admin, self.driver, self.other, self.resident = [
            User(name=role, email=f'{index}@test.example', password_hash='test', role=role)
            for index, role in enumerate([UserRole.admin, UserRole.driver, UserRole.driver, UserRole.resident])
        ]
        self.bin = Bin(location_name='Kigali', latitude=0, longitude=0, fill_level=100, status=BinStatus.full)
        self.db.add_all([self.admin, self.driver, self.other, self.resident, self.bin])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def route(self, user=None):
        return create_route(RouteCreate(name='Collection', scheduled_date=date.today(),
                            driver_id=self.driver.id, bin_ids=[self.bin.id]), self.db, user or self.admin)

    def denied(self, code, action):
        with self.assertRaises(HTTPException) as caught:
            action()
        self.assertEqual(caught.exception.status_code, code)

    def test_driver_submission_preserves_bin_until_admin_approval(self):
        route = self.route()
        stop = route.stops[0]
        self.denied(409, lambda: approve_route(route.id, self.db, self.admin))
        for user in [self.other, self.resident, self.admin]:
            self.denied(403, lambda: collect_stop(route.id, stop.id, self.db, user))
        collect_stop(route.id, stop.id, self.db, self.driver)
        self.assertEqual(self.bin.fill_level, 100)
        self.assertEqual(self.bin.status, BinStatus.full)
        self.denied(409, lambda: collect_stop(route.id, stop.id, self.db, self.driver))
        for user in [self.driver, self.other, self.resident]:
            self.denied(403, lambda: approve_route(route.id, self.db, user))
        self.denied(409, lambda: update_route(route.id, RouteUpdate(driver_id=self.other.id), self.db, self.admin))
        approve_route(route.id, self.db, self.admin)
        self.assertEqual(self.bin.fill_level, 0)
        self.assertEqual(self.bin.status, BinStatus.active)
        self.assertEqual(route.status.value, 'completed')
        self.denied(409, lambda: approve_route(route.id, self.db, self.admin))

    def test_assignment_eligibility_and_duplicates(self):
        self.denied(403, lambda: self.route(self.driver))
        self.bin.fill_level = 95
        self.db.commit()
        self.denied(409, self.route)
        self.bin.fill_level = 100
        self.bin.status = BinStatus.maintenance
        self.db.commit()
        self.denied(409, self.route)
        self.bin.status = BinStatus.full
        self.driver.is_active = False
        self.db.commit()
        self.denied(422, self.route)
        self.driver.is_active = True
        self.db.commit()
        self.route()
        self.denied(409, self.route)

    def test_bin_edit_cannot_bypass_approval(self):
        self.denied(409, lambda: update_bin(self.bin.id, BinUpdate(fill_level=0), self.db))
        self.denied(409, lambda: update_bin(self.bin.id, BinUpdate(status=BinStatus.active), self.db))
        self.denied(422, lambda: update_bin(self.bin.id, BinUpdate(fill_level=None), self.db))

    def test_approval_failure_rolls_back_task_and_bin(self):
        route = self.route()
        collect_stop(route.id, route.stops[0].id, self.db, self.driver)
        route_id, bin_id = route.id, self.bin.id
        with patch.object(self.db, 'commit', side_effect=RuntimeError('commit failed')):
            with self.assertRaises(RuntimeError):
                approve_route(route_id, self.db, self.admin)
        self.db.rollback()
        self.assertEqual(self.db.get(Bin, bin_id).fill_level, 100)
        self.assertEqual(self.db.get(Route, route_id).status.value, 'in_progress')

    def test_all_stops_required_and_maintenance_preserved(self):
        second = Bin(location_name='Second', latitude=0, longitude=0,
                     fill_level=100, status=BinStatus.full)
        self.db.add(second)
        self.db.commit()
        route = create_route(RouteCreate(name='Two stops', scheduled_date=date.today(),
            driver_id=self.driver.id, bin_ids=[self.bin.id, second.id]), self.db, self.admin)
        collect_stop(route.id, route.stops[0].id, self.db, self.driver)
        self.denied(409, lambda: approve_route(route.id, self.db, self.admin))
        self.assertEqual(self.bin.fill_level, 100)
        collect_stop(route.id, route.stops[1].id, self.db, self.driver)
        second.status = BinStatus.maintenance
        self.db.commit()
        approve_route(route.id, self.db, self.admin)
        self.assertEqual(second.fill_level, 0)
        self.assertEqual(second.status, BinStatus.maintenance)

    def test_resident_pickup_requires_approval(self):
        item = PickupRequest(resident_id=self.resident.id, driver_id=self.driver.id,
            location='Kigali', waste_type='Household', description='Collect waste',
            requested_date=date.today(), status=PickupStatus.accepted)
        self.db.add(item)
        self.db.commit()
        self.denied(403, lambda: complete_pickup_request(item.id, self.db, self.other))
        complete_pickup_request(item.id, self.db, self.driver)
        self.assertEqual(item.status, PickupStatus.submitted)
        self.denied(403, lambda: approve_pickup_request(item.id, self.db, self.driver))
        approve_pickup_request(item.id, self.db, self.admin)
        self.assertEqual(item.status, PickupStatus.completed)
        self.denied(409, lambda: approve_pickup_request(item.id, self.db, self.admin))

    def delivery(self, volume=36):
        return create_pickup_request(PickupRequestCreate(
            location='Resident home', waste_type='Household', description='Deliver waste',
            requested_date=date.today(), destination_bin_id=self.bin.id,
            waste_volume_liters=volume), self.db, self.resident)

    def submit_delivery(self, item):
        item.driver_id = self.driver.id
        item.status = PickupStatus.accepted
        self.db.commit()
        complete_pickup_request(item.id, self.db, self.driver)

    def test_approved_deliveries_fill_bin_then_queue_collection(self):
        self.bin.capacity_liters = 360
        self.bin.fill_level = 80
        self.bin.status = BinStatus.active
        self.db.commit()
        first = self.delivery()
        self.assertEqual(self.bin.fill_level, 80)
        self.submit_delivery(first)
        self.assertEqual(self.bin.fill_level, 80)
        approve_pickup_request(first.id, self.db, self.admin)
        self.assertAlmostEqual(self.bin.fill_level, 90)
        self.assertEqual(self.db.scalars(select(Route)).all(), [])
        second = self.delivery()
        self.submit_delivery(second)
        approve_pickup_request(second.id, self.db, self.admin)
        self.assertEqual(self.bin.fill_level, 100)
        self.assertEqual(self.bin.status, BinStatus.full)
        routes = self.db.scalars(select(Route)).all()
        self.assertEqual(len(routes), 1)
        route = routes[0]
        self.assertIsNone(route.driver_id)
        self.denied(409, lambda: approve_pickup_request(second.id, self.db, self.admin))
        self.assertEqual(self.bin.fill_level, 100)
        update_route(route.id, RouteUpdate(driver_id=self.driver.id), self.db, self.admin)
        collect_stop(route.id, route.stops[0].id, self.db, self.driver)
        self.assertEqual(self.bin.fill_level, 100)
        approve_route(route.id, self.db, self.admin)
        self.assertEqual(self.bin.fill_level, 0)

    def test_above_95_percent_queues_collection_without_rounding_to_full(self):
        self.bin.capacity_liters = 100
        self.bin.fill_level = 94
        self.bin.status = BinStatus.active
        self.db.commit()
        first = self.delivery(1)
        self.submit_delivery(first)
        approve_pickup_request(first.id, self.db, self.admin)
        self.assertEqual(self.bin.fill_level, 95)
        self.assertEqual(self.db.scalars(select(Route)).all(), [])
        self.denied(409, self.route)
        second = self.delivery(0.1)
        self.submit_delivery(second)
        approve_pickup_request(second.id, self.db, self.admin)
        self.assertAlmostEqual(self.bin.fill_level, 95.1)
        self.assertEqual(len(self.db.scalars(select(Route)).all()), 1)
        third = self.delivery(0.1)
        self.submit_delivery(third)
        approve_pickup_request(third.id, self.db, self.admin)
        self.assertAlmostEqual(self.bin.fill_level, 95.2)
        self.assertEqual(len(self.db.scalars(select(Route)).all()), 1)

    def test_above_95_percent_can_be_manually_assigned(self):
        self.bin.fill_level = 95.01
        self.bin.status = BinStatus.active
        self.db.commit()
        route = self.route()
        self.assertEqual(route.driver_id, self.driver.id)
        collect_stop(route.id, route.stops[0].id, self.db, self.driver)
        self.assertAlmostEqual(self.bin.fill_level, 95.01)
        approve_route(route.id, self.db, self.admin)
        self.assertEqual(self.bin.fill_level, 0)

    def test_delivery_overflow_and_maintenance_do_not_complete(self):
        self.bin.fill_level = 95
        self.bin.capacity_liters = 360
        self.bin.status = BinStatus.active
        self.db.commit()
        item = self.delivery()
        self.submit_delivery(item)
        self.denied(409, lambda: approve_pickup_request(item.id, self.db, self.admin))
        self.assertEqual(self.bin.fill_level, 95)
        self.assertEqual(item.status, PickupStatus.submitted)
        self.bin.fill_level = 50
        self.bin.status = BinStatus.maintenance
        self.db.commit()
        self.denied(409, lambda: approve_pickup_request(item.id, self.db, self.admin))
        self.assertEqual(self.bin.fill_level, 50)

    def test_delivery_volume_validation_and_revision_requires_driver_confirmation(self):
        self.bin.fill_level = 20
        self.bin.status = BinStatus.active
        self.db.commit()
        for volume in [0, -1, float('nan'), float('inf')]:
            with self.assertRaises(ValidationError):
                self.delivery(volume)
        self.denied(422, lambda: self.delivery(1000))
        item = self.delivery(10)
        update_pickup_request(item.id, PickupRequestUpdate(waste_volume_liters=20), self.db, self.resident)
        self.assertEqual(self.bin.fill_level, 20)
        self.assertEqual(item.waste_volume_liters, 20)
        self.submit_delivery(item)
        update_pickup_request(item.id, PickupRequestUpdate(waste_volume_liters=30), self.db, self.resident)
        self.assertEqual(item.status, PickupStatus.assigned)
        self.assertEqual(item.waste_volume_liters, 30)
        self.assertEqual(self.bin.fill_level, 20)
        self.denied(409, lambda: approve_pickup_request(item.id, self.db, self.admin))

    def test_resident_can_edit_only_own_unfinished_requests(self):
        item = self.delivery(10)
        stranger = User(name='Other resident', email='stranger@test.example',
                        password_hash='test', role=UserRole.resident)
        self.db.add(stranger)
        self.db.commit()
        for state in [PickupStatus.requested, PickupStatus.assigned, PickupStatus.accepted, PickupStatus.submitted]:
            item.status = state
            item.driver_id = self.driver.id
            self.db.commit()
            self.denied(404, lambda: update_pickup_request(item.id,
                PickupRequestUpdate(description='Not my request'), self.db, stranger))
            self.denied(403, lambda: update_pickup_request(item.id,
                PickupRequestUpdate(description='Driver edit'), self.db, self.driver))
            update_pickup_request(item.id, PickupRequestUpdate(description=f'Revised {state.value}'), self.db, self.resident)
            self.assertEqual(item.driver_id, self.driver.id)
            self.assertEqual(item.status, PickupStatus.requested if state == PickupStatus.requested else PickupStatus.assigned)
        for state in [PickupStatus.completed, PickupStatus.cancelled]:
            item.status = state
            self.db.commit()
            self.denied(409, lambda: update_pickup_request(item.id,
                PickupRequestUpdate(description='Too late'), self.db, self.resident))

    def test_unchanged_past_date_and_noop_do_not_invalidate_submission(self):
        from datetime import timedelta
        item = self.delivery(10)
        item.requested_date = date.today() - timedelta(days=1)
        item.status = PickupStatus.submitted
        item.driver_id = self.driver.id
        self.db.commit()
        update_pickup_request(item.id, PickupRequestUpdate(requested_date=item.requested_date,
            description=item.description), self.db, self.resident)
        self.assertEqual(item.status, PickupStatus.submitted)
        update_pickup_request(item.id, PickupRequestUpdate(description='Corrected notes',
            requested_date=item.requested_date), self.db, self.resident)
        self.assertEqual(item.status, PickupStatus.assigned)

    def test_delivery_approval_failure_rolls_back_fill_and_auto_task(self):
        self.bin.fill_level = 90
        self.bin.capacity_liters = 360
        self.bin.status = BinStatus.active
        self.db.commit()
        item = self.delivery()
        self.submit_delivery(item)
        item_id, bin_id = item.id, self.bin.id
        with patch.object(self.db, 'commit', side_effect=RuntimeError('commit failed')):
            with self.assertRaises(RuntimeError):
                approve_pickup_request(item_id, self.db, self.admin)
        self.db.rollback()
        self.assertEqual(self.db.get(Bin, bin_id).fill_level, 90)
        self.assertEqual(self.db.get(PickupRequest, item_id).status, PickupStatus.submitted)
        self.assertEqual(self.db.scalars(select(Route)).all(), [])


if __name__ == '__main__':
    unittest.main()
