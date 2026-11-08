import { useLocation } from "react-router-dom"
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { Menu } from "@/icons"
import { canAccessView } from "@/app/config/navigation"
import {
  getEnabledDependents,
  getMissingDependencies,
  moduleRegistry,
  type EnterpriseModuleId,
} from "@/app/config/module-registry"
import { useAppRoute } from "@/app/routes/useAppRoute"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import Brand from "@/components/layout/Brand"
import { Sidebar } from "@/components/layout/AppShell"
import { IconButton } from "@/components/ui"
import { DependencyModal } from "@/components/feedback/ApplicationOverlays"
import { AccessDeniedState, LoadingState } from "@/components/feedback/AsyncState"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useCommunities, CreateCommunityPage } from "@/features/communities"
import {
  ActiveLoansPage,
  GuarantorsPage,
  LoanApplicationDetailPage,
  LoanApplicationsPage,
  LoanDetailPage,
  LoanProductsPage,
  DisbursementsPage,
  LoansOverviewPage,
  PublicApplicationPage,
  RecoveryPage,
  RepaymentsPage,
} from "@/features/loans"
import { AccessControls, TransactionTable, WalletList, WalletOverview, WalletPage } from "@/features/wallet"
import ReportsPage from "@/features/reports/pages/ReportsPage"
import OrganizationProfilePage from "@/features/organization/components/OrganizationProfile"
import OnboardingFlow from "@/features/onboarding/components/OnboardingFlow"
import AuthPage from "@/features/auth/components/AuthPage"
import ForcedChangePasswordPage from "@/features/auth/components/ForcedChangePasswordPage"
import { useAuth } from "@/features/auth/hooks/useAuth"
import EnvironmentBanner from "@/features/onboarding/components/EnvironmentBanner"
import Breadcrumbs from "@/components/navigation/Breadcrumbs"
import SettingsTabs from "@/features/settings/components/SettingsTabs"
import { settingsTabFor } from "@/app/config/navigation"
import { CompliancePage, CorporatePage } from "@/features/compliance/components/CompliancePages"
import WalletSettlementPage from "@/features/wallet-settlement/components/WalletSettlementPage"
import { useCompliance } from "@/features/compliance/hooks/useCompliance"
import { useCorporateAccount } from "@/features/corporate-account/hooks/useCorporateAccount"
import { DuesCreatePage, DuesDetailPage, DuesOverviewPage } from "@/features/dues"
import {
  ContributionCreatePage,
  ContributionDetailPage,
  ContributionsOverviewPage,
  PublicContributionPage,
} from "@/features/contributions"
import {
  AddMemberModal,
  ImportMembersModal,
  MemberApplicationDetailPage,
  MemberApplicationFormsPage,
  MemberApplicationsPage,
  MemberProfile,
  MembersPage,
  PublicMemberApplicationPage,
} from "@/features/members"
import { ModulesPage } from "@/features/organization/components/OrganizationPages"
import { StructurePage } from "@/features/organization/components/StructurePage"
import { Dashboard } from "@/features/overview/OverviewPage"
import { GenericPage, SettingsPage } from "@/features/settings/components/SettingsPages"
import { WorkflowsPage } from "@/features/workflows/components/BuilderPages"
import { CommunicationsPage } from "@/features/communications"

const GroupsPage = lazy(() =>
  import("@/features/groups/components/GroupsPage").then((module) => ({
    default: module.GroupsPage,
  })),
)
const GroupDetailsPage = lazy(() =>
  import("@/features/groups/components/GroupDetailsPage").then((module) => ({
    default: module.GroupDetailsPage,
  })),
)
const BranchesPage = lazy(() =>
  import("@/features/branches/components/BranchesPage").then((module) => ({
    default: module.BranchesPage,
  })),
)
const BranchDetailsPage = lazy(() =>
  import("@/features/branches/components/BranchDetailsPage").then((module) => ({
    default: module.BranchDetailsPage,
  })),
)
const AdministratorsPage = lazy(() =>
  import("@/features/administrators/components/AdministratorsPage").then((module) => ({
    default: module.AdministratorsPage,
  })),
)
const AdministratorDetailsPage = lazy(() =>
  import("@/features/administrators/components/AdministratorDetailsPage").then((module) => ({
    default: module.AdministratorDetailsPage,
  })),
)
const RolesPage = lazy(() =>
  import("@/features/administrators/components/RolesPage").then((module) => ({
    default: module.RolesPage,
  })),
)

type Overlay = "import" | "add-member" | null

export default function FinSquareApp() {
  const { state, dispatch, enabledModules, isLive } = useWorkspace()
  const { view, entityId, navigate } = useAppRoute()
  const { can } = useAuthorization()
  const { signOut } = useAuth()
  const { setStatus: setComplianceStatus } = useCompliance(state.activeCommunityId)
  const { saveDetails: saveCorporateDetails, setStatus: setCorporateStatus } = useCorporateAccount(state.activeCommunityId)
  const { pathname } = useLocation()
  // The communities belong to whoever is signed in, so they are only asked for once there is a session.
  const { communities } = useCommunities(Boolean(state.session))
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState("")
  const [dependency, setDependency] = useState<EnterpriseModuleId | null>(null)
  /** Which pre-shell screen to show while there is no session; "auto" follows the workspace state. */
  const [authScreen, setAuthScreen] = useState<"auto" | "signup">("auto")

  // The membership list is what tells the workspace which communities exist and what role the
  // administrator holds in each, so it is folded into the store as soon as it arrives.
  useEffect(() => {
    if (!state.session || !communities.length) return
    dispatch({ type: "communities/synced", value: communities })
  }, [state.session, communities, dispatch])

  const identity = state.session?.name || state.admin.name || "Admin User"
  const identityInitials = identity
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
  const handleSignOut = () => {
    void signOut()
  }

  const notify = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(""), 2800)
  }

  const toggleModule = (id: string) => {
    const moduleId = id as EnterpriseModuleId
    const module = moduleRegistry[moduleId]
    if (enabledModules.has(moduleId)) {
      const dependents = getEnabledDependents(moduleId, enabledModules)
      if (dependents.length) {
        notify(`${module.name} is required by ${dependents.map((dependent) => dependent.name).join(", ")}`)
        return
      }
      dispatch({
        type: "modules/replaced",
        value: state.enabledModules.filter((enabled) => enabled !== moduleId),
      })
      notify(`${module.name} disabled`)
      return
    }

    if (getMissingDependencies(moduleId, enabledModules).length) {
      setDependency(moduleId)
      return
    }
    dispatch({
      type: "modules/replaced",
      value: [...state.enabledModules, moduleId],
    })
    notify(`${module.name} enabled`)
  }

  const confirmDependency = () => {
    if (!dependency) return
    const required = getMissingDependencies(dependency, enabledModules)
    dispatch({
      type: "modules/replaced",
      value: [...new Set([...state.enabledModules, ...required, dependency])],
    })
    notify(`${moduleRegistry[dependency].name} and required modules enabled`)
    setDependency(null)
  }

  let content: ReactNode
  if (!canAccessView(view, enabledModules, can)) {
    content = <AccessDeniedState />
  } else if (view === "overview") {
    content = (
      <Dashboard
        live={isLive}
        setView={navigate}
        onImport={() => setOverlay("import")}
        administratorName={identity.split(/\s+/)[0] || "there"}
        organizationName={state.organization.name}
      />
    )
  } else if (view === "members") {
    content = (
      <MembersPage
        onImport={() => setOverlay("import")}
        onProfile={(id) => navigate("member-profile", id)}
        onAdd={() => setOverlay("add-member")}
        onApplications={() => navigate("member-applications")}
      />
    )
  } else if (view === "member-profile") {
    content = <MemberProfile memberId={entityId ?? ""} navigate={navigate} notify={notify} />
  } else if (view === "groups") {
    content = <GroupsPage onViewGroup={(id) => navigate("group-detail", id)} notify={notify} />
  } else if (view === "group-detail") {
    content = <GroupDetailsPage groupId={entityId ?? ""} notify={notify} />
  } else if (view === "branches") {
    content = <BranchesPage onViewBranch={(id) => navigate("branch-detail", id)} notify={notify} />
  } else if (view === "branch-detail") {
    content = <BranchDetailsPage branchId={entityId ?? ""} onViewGroup={(id) => navigate("group-detail", id)} />
  } else if (view === "structure") {
    content = <StructurePage navigate={navigate} />
  } else if (view === "community-create") {
    content = (
      <CreateCommunityPage
        navigate={navigate}
        notify={notify}
        onCreated={(membership) => {
          // Registering the community both adds it to the switcher and makes it the active tenant.
          dispatch({ type: "communities/created", value: membership })
        }}
      />
    )
  } else if (view === "modules") {
    content = <ModulesPage enabled={enabledModules} toggle={toggleModule} />
  } else if (view === "contributions") {
    content = <ContributionsOverviewPage view="contributions" navigate={navigate} notify={notify} />
  } else if (view === "contribution-detail") {
    content = (
      <ContributionDetailPage view="contribution-detail" id={entityId ?? ""} navigate={navigate} notify={notify} />
    )
  } else if (view === "contribution-create") {
    content = <ContributionCreatePage view="contribution-create" navigate={navigate} notify={notify} />
  } else if (view === "dues") {
    content = <DuesOverviewPage view="dues" navigate={navigate} notify={notify} />
  } else if (view === "dues-detail") {
    content = <DuesDetailPage view="dues-detail" id={entityId ?? ""} navigate={navigate} notify={notify} />
  } else if (view === "dues-create") {
    content = <DuesCreatePage view="dues-create" navigate={navigate} notify={notify} />
  } else if (view.startsWith("wallet")) {
    content = (
      <WalletPage navigate={navigate} notify={notify} id={entityId}>
        {(ctx) =>
          view === "wallet" ? (
            <WalletOverview ctx={ctx} />
          ) : view === "wallets" ? (
            <WalletList ctx={ctx} />
          ) : view === "wallet-transactions" ? (
            <TransactionTable ctx={ctx} />
          ) : (
            <AccessControls ctx={ctx} />
          )
        }
      </WalletPage>
    )
  } else if (view === "loans") {
    content = <LoansOverviewPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-applications") {
    content = <LoanApplicationsPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-application-detail") {
    content = <LoanApplicationDetailPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-active") {
    content = <ActiveLoansPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-detail") {
    content = <LoanDetailPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-repayments") {
    content = <RepaymentsPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-guarantors") {
    content = <GuarantorsPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-recovery") {
    content = <RecoveryPage navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-products" || view === "loan-type-create") {
    content = <LoanProductsPage key={view} navigate={navigate} notify={notify} id={entityId} />
  } else if (view === "loan-disbursements") {
    content = <DisbursementsPage navigate={navigate} notify={notify} />
  } else if (view === "reports") {
    content = <ReportsPage navigate={navigate} notify={notify} enabled={enabledModules} />
  } else if (view === "communication") {
    content = <CommunicationsPage notify={notify} />
  } else if (view === "workflows") {
    content = <WorkflowsPage notify={notify} />
  } else if (view === "member-applications") {
    content = <MemberApplicationsPage navigate={navigate} notify={notify} />
  } else if (view === "member-application-detail") {
    content = <MemberApplicationDetailPage applicationId={entityId ?? ""} navigate={navigate} notify={notify} />
  } else if (view === "member-application-forms") {
    content = <MemberApplicationFormsPage notify={notify} />
  } else if (view === "administrators") {
    content = (
      <AdministratorsPage
        onViewAdministrator={(id) => navigate("administrator-detail", id)}
        onManageRoles={() => navigate("roles")}
        notify={notify}
      />
    )
  } else if (view === "administrator-detail") {
    content = <AdministratorDetailsPage administratorId={entityId ?? ""} />
  } else if (view === "roles" || view === "role-detail") {
    content = (
      <RolesPage
        selectedRoleId={view === "role-detail" ? entityId : undefined}
        onSelectRole={(id) => navigate("role-detail", id)}
        notify={notify}
      />
    )
  } else if (view === "compliance") {
    content = (
      <CompliancePage
        docs={state.complianceDocuments}
        updateDoc={(index, status) => {
          void setComplianceStatus(index, status)
          notify(status === "Approved" ? "Document approved" : "Document ready to replace")
        }}
      />
    )
  } else if (view === "corporate") {
    content = (
      <CorporatePage
        details={{
          ...state.corporateDetails,
          businessName: state.corporateDetails.businessName || state.organization.legalName,
          registrationNumber: state.corporateDetails.registrationNumber || state.organization.registrationNumber,
          businessAddress: state.corporateDetails.businessAddress || state.organization.address,
          accountHolder: state.corporateDetails.accountHolder || state.organization.name,
          repName: state.corporateDetails.repName || state.admin.name,
          repEmail: state.corporateDetails.repEmail || state.admin.email,
          repPhone: state.corporateDetails.repPhone || state.admin.phone,
        }}
        saveDetails={saveCorporateDetails}
        status={state.corporateAccountStatus}
        setStatus={setCorporateStatus}
        notify={notify}
      />
    )
  } else if (view === "settlement") {
    content = <WalletSettlementPage notify={notify} />
  } else if (view === "organization") {
    content = (
      <OrganizationProfilePage
        profile={state.organization}
        save={(value) => dispatch({ type: "organization/updated", value })}
        notify={notify}
        environment={state.environment}
        restartOnboarding={() => dispatch({ type: "onboarding/restarted" })}
        canEdit={can("settings.manage")}
      />
    )
  } else if (view === "settings") {
    content = (
      <SettingsPage
        theme={state.theme}
        setTheme={(value) => dispatch({ type: "preferences/theme-changed", value })}
        organization={state.organization}
        setLogo={(logo) => dispatch({ type: "organization/updated", value: { logo } })}
        accent={state.accent}
        setAccent={(accent) => dispatch({ type: "preferences/accent-changed", value: accent })}
        notify={notify}
        onSignOut={handleSignOut}
      />
    )
  } else {
    content = <GenericPage view={view} navigate={navigate} />
  }

  if (pathname.startsWith("/apply/")) return <PublicApplicationPage slug={pathname.split("/")[2] ?? ""} />
  if (pathname.startsWith("/join/")) return <PublicMemberApplicationPage slug={pathname.split("/")[2] ?? ""} />
  if (pathname.startsWith("/contribute/")) {
    const segments = pathname.split("/")
    // `/contribute/:slug` is the pool link; `/contribute/:slug/m/:memberId` is a member's own link.
    return <PublicContributionPage slug={segments[2] ?? ""} memberId={segments[3] === "m" ? segments[4] : undefined} />
  }

  // Authentication gate. The public links above stay reachable without a session; the login page
  // itself switches to sign up, which is the onboarding flow creating the administrator account.
  if (!state.session) {
    return authScreen === "signup" ? (
      <OnboardingFlow onLogin={() => setAuthScreen("auto")} />
    ) : (
      <AuthPage
        onSignUp={() => {
          dispatch({ type: "onboarding/restarted" })
          setAuthScreen("signup")
        }}
      />
    )
  }
  if (state.session.mustChangePassword) return <ForcedChangePasswordPage />
  if (!state.onboardingCompleted) return <OnboardingFlow />

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        setView={navigate}
        enabled={enabledModules}
        open={sidebarOpen}
        close={() => setSidebarOpen(false)}
        can={can}
        onSignOut={handleSignOut}
      />
      <div className="app-main">
        <header className="mobile-header">
          <IconButton icon={Menu} label="Open menu" onClick={() => setSidebarOpen(true)} />
          <Brand />
          <div className="avatar">{identityInitials}</div>
        </header>
        <main>
          <EnvironmentBanner environment={state.environment} onAction={() => navigate("corporate")} />
          <Breadcrumbs view={view} navigate={navigate} />
          <Suspense fallback={<LoadingState label="Loading page…" />}>
            {settingsTabFor(view) && canAccessView(view, enabledModules, can) && (
              <SettingsTabs view={view} navigate={navigate} enabled={enabledModules} can={can} />
            )}
            {content}
          </Suspense>
        </main>
      </div>

      {overlay === "import" && (
        <ImportMembersModal
          onClose={() => setOverlay(null)}
          onComplete={(imported) => {
            setOverlay(null)
            navigate("members")
            notify(`${imported.toLocaleString()} members imported successfully`)
          }}
        />
      )}
      {overlay === "add-member" && (
        <AddMemberModal
          onClose={() => setOverlay(null)}
          notify={notify}
          onUseForm={() => {
            setOverlay(null)
            navigate("member-application-forms")
          }}
        />
      )}
      {dependency && (
        <DependencyModal
          moduleId={dependency}
          enabled={enabledModules}
          onClose={() => setDependency(null)}
          onConfirm={confirmDependency}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
