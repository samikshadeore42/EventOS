from sqlalchemy.orm import Session
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
import uuid
from typing import List, Optional
import re

class OrganizationService:
    @staticmethod
    def normalize_slug(slug: str) -> str:
        # Convert to lowercase and replace non-alphanumeric with hyphens
        slug = slug.strip().lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        return slug.strip('-')

    @staticmethod
    def get_organization_by_slug(db: Session, slug: str) -> Optional[Organization]:
        return db.query(Organization).filter(Organization.slug == OrganizationService.normalize_slug(slug)).first()

    @staticmethod
    def get_organization_by_id(db: Session, org_id: uuid.UUID) -> Optional[Organization]:
        return db.query(Organization).filter(Organization.id == org_id).first()

    @staticmethod
    def create_organization(db: Session, name: str, slug: str, description: str = None) -> Organization:
        org = Organization(
            name=name,
            slug=OrganizationService.normalize_slug(slug),
            description=description
        )
        db.add(org)
        db.flush()
        return org

    @staticmethod
    def create_membership(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID, role: str) -> OrganizationMembership:
        membership = OrganizationMembership(
            organization_id=organization_id,
            user_id=user_id,
            role=role,
            status="active"
        )
        db.add(membership)
        db.flush()
        return membership

    @staticmethod
    def get_membership(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID) -> Optional[OrganizationMembership]:
        return db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user_id
        ).first()

    @staticmethod
    def is_last_active_owner(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        # Check if there are other active owners
        active_owners = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.role == 'owner',
            OrganizationMembership.status == 'active'
        ).count()
        
        # If this user is an owner and the count is 1, they are the last owner
        if active_owners == 1:
            membership = OrganizationService.get_membership(db, organization_id, user_id)
            if membership and membership.role == 'owner' and membership.status == 'active':
                return True
        return False
