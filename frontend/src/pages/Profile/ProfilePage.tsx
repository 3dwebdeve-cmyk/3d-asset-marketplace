import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { getProfile } from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { AVATAR_ALLOWED_EXTENSIONS, AVATAR_MAX_BYTES } from './avatarRules'
import { useAvatarUpload } from './useAvatarUpload'
import { useProfileForm } from './useProfileForm'

export function ProfilePage() {
  const profileQuery = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: getProfile,
  })

  const { register, handleSubmit, errors, isSubmitting, isDirty, serverError, onSubmit } =
    useProfileForm(profileQuery.data)

  const {
    selectedFile,
    previewUrl,
    clientError,
    serverError: avatarServerError,
    isUploading,
    isRemoving,
    onFileChange,
    onUpload,
    onRemove,
  } = useAvatarUpload(profileQuery.data)

  const avatarError = clientError ?? avatarServerError
  const maxMb = AVATAR_MAX_BYTES / (1024 * 1024)

  return (
    <main className="auth-page">
      <section className="auth-card auth-card--wide" aria-labelledby="profile-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">Your account</p>
          <h1 id="profile-title">Profile</h1>
          <p className="auth-card__subtitle">
            Update your avatar, company, and contact details. These appear on invoices
            and project requests.
          </p>
        </header>

        {profileQuery.isLoading ? (
          <Spinner label="Loading your profile..." />
        ) : profileQuery.isError ? (
          <ErrorState
            title="Could not load your profile"
            description="We could not load your profile details. Please try again."
            action={
              <Button
                variant="secondary"
                isLoading={profileQuery.isFetching}
                onClick={() => profileQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="profile-meta" aria-label="Account details">
              <p>
                <strong>Name:</strong> {profileQuery.data?.full_name}
              </p>
              <p>
                <strong>Email:</strong> {profileQuery.data?.email}
              </p>
            </div>

            <section className="avatar-uploader" aria-labelledby="avatar-title">
              <h2 id="avatar-title" className="avatar-uploader__title">
                Avatar
              </h2>
              <p className="avatar-uploader__hint">
                JPG, PNG, or WebP · max {maxMb} MB · {AVATAR_ALLOWED_EXTENSIONS.join(', ')}
              </p>

              <div className="avatar-uploader__row">
                <div className="avatar-uploader__preview" aria-hidden={!previewUrl}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="avatar-uploader__image" />
                  ) : (
                    <span className="avatar-uploader__placeholder">No photo</span>
                  )}
                </div>

                <div className="avatar-uploader__controls">
                  <FormField id="avatar" label="Choose image" error={avatarError ?? undefined}>
                    <Input
                      id="avatar"
                      type="file"
                      accept={AVATAR_ALLOWED_EXTENSIONS.join(',')}
                      hasError={Boolean(avatarError)}
                      aria-invalid={Boolean(avatarError)}
                      aria-describedby={avatarError ? 'avatar-error' : undefined}
                      onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                    />
                  </FormField>

                  <div className="avatar-uploader__actions">
                    <Button
                      type="button"
                      isLoading={isUploading}
                      disabled={!selectedFile || isRemoving}
                      onClick={onUpload}
                    >
                      Upload avatar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={isRemoving}
                      disabled={!profileQuery.data?.avatar || isUploading}
                      onClick={onRemove}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {serverError ? <Alert variant="error" message={serverError} /> : null}

            <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <FormField
                id="company_name"
                label="Company"
                error={errors.company_name?.message}
              >
                <Input
                  id="company_name"
                  type="text"
                  autoComplete="organization"
                  hasError={Boolean(errors.company_name)}
                  aria-invalid={Boolean(errors.company_name)}
                  aria-describedby={errors.company_name ? 'company_name-error' : undefined}
                  {...register('company_name')}
                />
              </FormField>

              <FormField id="website" label="Website" error={errors.website?.message}>
                <Input
                  id="website"
                  type="url"
                  autoComplete="url"
                  placeholder="https://"
                  hasError={Boolean(errors.website)}
                  aria-invalid={Boolean(errors.website)}
                  aria-describedby={errors.website ? 'website-error' : undefined}
                  {...register('website')}
                />
              </FormField>

              <FormField id="address" label="Address" error={errors.address?.message}>
                <Input
                  id="address"
                  type="text"
                  autoComplete="street-address"
                  hasError={Boolean(errors.address)}
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? 'address-error' : undefined}
                  {...register('address')}
                />
              </FormField>

              <FormField id="city" label="City" error={errors.city?.message}>
                <Input
                  id="city"
                  type="text"
                  autoComplete="address-level2"
                  hasError={Boolean(errors.city)}
                  aria-invalid={Boolean(errors.city)}
                  aria-describedby={errors.city ? 'city-error' : undefined}
                  {...register('city')}
                />
              </FormField>

              <FormField id="country" label="Country" error={errors.country?.message}>
                <Input
                  id="country"
                  type="text"
                  autoComplete="country-name"
                  hasError={Boolean(errors.country)}
                  aria-invalid={Boolean(errors.country)}
                  aria-describedby={errors.country ? 'country-error' : undefined}
                  {...register('country')}
                />
              </FormField>

              <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
                Save profile
              </Button>
            </form>
          </>
        )}

        <p className="auth-card__footer">
          <Link className="auth-link" to="/dashboard">
            Back to dashboard
          </Link>
        </p>
      </section>
    </main>
  )
}
